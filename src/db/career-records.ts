import { asc, eq } from 'drizzle-orm'
import {
  authorsSchema,
  extensionSchema,
  jsonValueSchema,
  parseJsonColumn,
  serializeJsonColumn,
  sourceUrlsSchema,
  stringListSchema,
  urlListSchema,
} from '../lib/career/json-schemas'
import { nowISO } from '../lib/date'
import {
  assertExpectedRevision,
  type CareerDb,
  CareerReferenceError,
  type CareerWriteResult,
  recordCareerChange,
  stableFingerprint,
} from './career-state'
import { db } from './client'
import {
  type CareerAchievement,
  type CareerEducation,
  type CareerExperience,
  type CareerPortfolioTopic,
  type CareerProject,
  type CareerPublication,
  type CareerStory,
  careerAchievementDirections,
  careerAchievementPublications,
  careerAchievementSkills,
  careerAchievements,
  careerDirections,
  careerEducation,
  careerExperiences,
  careerPortfolioTopicDirections,
  careerPortfolioTopicProjects,
  careerPortfolioTopics,
  careerProjectDirections,
  careerProjectSkills,
  careerProjects,
  careerPublicationDirections,
  careerPublicationProjects,
  careerPublications,
  careerStories,
  careerStoryDirections,
  skills,
} from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Editorial career records: education, experiences, achievements, projects,
 * stories, publications and portfolio topics. Every write inside this module:
 *
 * - compares the complete logical content (including ordered junctions) and is
 *   completely invisible when nothing changed: no revision bump, no
 *   `updated_at` change and no `career_state` write;
 * - increments the row revision and records one career change otherwise;
 * - replaces the record's junctions wholesale inside the same transaction,
 *   preserving array order in `position`, and rejects unknown, duplicated or
 *   retired references;
 * - treats retirement as a flag: rows and junctions are never deleted, and
 *   retired records stay out of the default list.
 *
 * `stable_key` is the external identity. It is required on updates and may not
 * change; renaming the display fields keeps the key.
 */

export type ListOptions = { includeRetired?: boolean }
export type UpdateOptions = { expectedRevision?: number }
export type CareerMoveDirection = 'up' | 'down'
export type CareerDatePrecision = 'day' | 'month' | 'year'
export type CareerProjectEligibility = 'resume-eligible' | 'not-eligible'
export type CareerPublicationStatus = 'published' | 'in-review' | 'preprint' | 'needs-verification'

// ---------------------------------------------------------------------------
// Shared write and reference helpers
// ---------------------------------------------------------------------------

function requireText(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new CareerReferenceError(`${label} is required.`)
  return trimmed
}

function assertStableKey(entity: string, existing: string, submitted: string): void {
  if (existing !== submitted) {
    throw new CareerReferenceError(
      `${entity} stable_key "${existing}" is the external identity and cannot be changed.`,
    )
  }
}

function assertUniqueReferences(label: string, values: Array<number | string>): void {
  if (new Set(values).size !== values.length) {
    throw new CareerReferenceError(`${label} must not contain duplicate references.`)
  }
}

function requireSkillIds(tx: CareerDb, ids: number[]): void {
  assertUniqueReferences('skills', ids)
  for (const id of ids) {
    const skill = tx.select().from(skills).where(eq(skills.id, id)).get()
    if (!skill) throw new CareerReferenceError(`Unknown catalog skill id ${id}.`)
    if (skill.reviewStatus === 'merged') {
      throw new CareerReferenceError(
        `Catalog skill ${id} is merged; reference its target skill instead.`,
      )
    }
  }
}

function requireDirectionKeys(tx: CareerDb, keys: string[]): void {
  assertUniqueReferences('directions', keys)
  for (const key of keys) {
    const direction = tx.select().from(careerDirections).where(eq(careerDirections.key, key)).get()
    if (!direction) throw new CareerReferenceError(`Unknown direction "${key}".`)
    if (direction.retiredAt !== null)
      throw new CareerReferenceError(`Direction "${key}" is retired.`)
  }
}

function requireProjectIds(tx: CareerDb, ids: number[]): void {
  assertUniqueReferences('projects', ids)
  for (const id of ids) {
    const project = tx.select().from(careerProjects).where(eq(careerProjects.id, id)).get()
    if (!project) throw new CareerReferenceError(`Unknown project id ${id}.`)
    if (project.retiredAt !== null) throw new CareerReferenceError(`Project ${id} is retired.`)
  }
}

function requirePublicationIds(tx: CareerDb, ids: number[]): void {
  assertUniqueReferences('publications', ids)
  for (const id of ids) {
    const publication = tx
      .select()
      .from(careerPublications)
      .where(eq(careerPublications.id, id))
      .get()
    if (!publication) throw new CareerReferenceError(`Unknown publication id ${id}.`)
    if (publication.retiredAt !== null)
      throw new CareerReferenceError(`Publication ${id} is retired.`)
  }
}

function requireExperience(tx: CareerDb, id: number | null | undefined): void {
  if (id === null || id === undefined) return
  const experience = tx.select().from(careerExperiences).where(eq(careerExperiences.id, id)).get()
  if (!experience) throw new CareerReferenceError(`Unknown experience id ${id}.`)
}

function requireDatePrecision(value: string): CareerDatePrecision {
  if (value !== 'day' && value !== 'month' && value !== 'year') {
    throw new CareerReferenceError(`Unsupported date precision "${value}".`)
  }
  return value
}

function requireEligibility(value: string): CareerProjectEligibility {
  if (value !== 'resume-eligible' && value !== 'not-eligible') {
    throw new CareerReferenceError(`Unsupported project eligibility "${value}".`)
  }
  return value
}

function requirePublicationStatus(value: string): CareerPublicationStatus {
  const statuses: CareerPublicationStatus[] = [
    'published',
    'in-review',
    'preprint',
    'needs-verification',
  ]
  if (!statuses.includes(value as CareerPublicationStatus)) {
    throw new CareerReferenceError(`Unsupported publication status "${value}".`)
  }
  return value as CareerPublicationStatus
}

function requirePublicationYear(value: number): number {
  if (!Number.isInteger(value) || value < 1900 || value > 2100) {
    throw new CareerReferenceError(`Publication year ${value} must be between 1900 and 2100.`)
  }
  return value
}

/** No-op detection plus the revision/career-state bookkeeping for one write. */
function commitRecordWrite(args: {
  tx: CareerDb
  current: { revision: number } | null
  currentContent: unknown
  nextContent: unknown
}): { changed: boolean; revision: number } {
  if (
    args.current &&
    stableFingerprint(args.currentContent) === stableFingerprint(args.nextContent)
  ) {
    return { changed: false, revision: args.current.revision }
  }
  const revision = args.current ? args.current.revision + 1 : 1
  recordCareerChange(args.tx, stableFingerprint(args.nextContent))
  return { changed: true, revision }
}

function insertLinks<T>(rows: T[], insert: (row: T) => void): void {
  for (const row of rows) insert(row)
}

type OrderedRecord = { id: number; sortOrder: number; revision: number; retiredAt: string | null }

/**
 * Resolves the new `sort_order` for one move. The neighbour is chosen from the
 * same visibility set the editor lists (retired rows only step among retired
 * rows), and the moved row lands strictly before or after it, so ties — every
 * new record defaults to 0 — resolve without rewriting the whole table.
 */
function nextSortOrder(
  rows: OrderedRecord[],
  id: number,
  direction: CareerMoveDirection,
): { sortOrder: number; current: OrderedRecord } | null {
  const ordered = [...rows].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
  )
  const current = ordered.find((row) => row.id === id)
  if (!current) return null
  const visible = ordered.filter((row) => (row.retiredAt === null) === (current.retiredAt === null))
  const index = visible.findIndex((row) => row.id === id)
  const neighbour = visible[direction === 'up' ? index - 1 : index + 1]
  if (!neighbour) return { sortOrder: current.sortOrder, current }
  return {
    sortOrder: direction === 'up' ? neighbour.sortOrder - 1 : neighbour.sortOrder + 1,
    current,
  }
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export type CareerEducationInput = {
  stableKey: string
  degree: string
  school: string
  startDate?: string | null
  endDate?: string | null
  datePrecision?: CareerDatePrecision
  displayDates?: string | null
  year?: number | null
  sortOrder?: number
  coursework?: string[]
  details?: unknown
}

export type CareerEducationRecord = Omit<CareerEducation, 'courseworkJson' | 'detailsJson'> & {
  coursework: string[]
  details: unknown
}

function educationContent(source: CareerEducationInput | CareerEducationRecord) {
  return {
    stableKey: source.stableKey,
    degree: source.degree,
    school: source.school,
    startDate: source.startDate ?? null,
    endDate: source.endDate ?? null,
    datePrecision: source.datePrecision ?? 'day',
    displayDates: source.displayDates ?? null,
    year: source.year ?? null,
    sortOrder: source.sortOrder ?? 0,
    coursework: source.coursework ?? [],
    details: source.details ?? null,
  }
}

function educationColumns(content: ReturnType<typeof educationContent>) {
  return {
    stableKey: content.stableKey,
    degree: content.degree,
    school: content.school,
    startDate: content.startDate,
    endDate: content.endDate,
    datePrecision: requireDatePrecision(content.datePrecision),
    displayDates: content.displayDates,
    year: content.year,
    sortOrder: content.sortOrder,
    courseworkJson: serializeJsonColumn(stringListSchema.parse(content.coursework)),
    detailsJson: content.details === null ? null : serializeJsonColumn(content.details),
  }
}

function educationToRecord(row: CareerEducation): CareerEducationRecord {
  return {
    ...row,
    coursework: parseJsonColumn(
      row.courseworkJson,
      stringListSchema,
      [],
      'career_education.coursework_json',
    ),
    details: parseJsonColumn(
      row.detailsJson,
      jsonValueSchema,
      null,
      'career_education.details_json',
    ),
  }
}

function requireEducation(tx: CareerDb, id: number): CareerEducation {
  const row = tx.select().from(careerEducation).where(eq(careerEducation.id, id)).get()
  if (!row) throw new CareerReferenceError(`Career education ${id} does not exist.`)
  return row
}

export function listCareerEducation(
  executor: DbExecutor = db,
  options: ListOptions = {},
): CareerEducationRecord[] {
  return executor
    .select()
    .from(careerEducation)
    .orderBy(asc(careerEducation.sortOrder), asc(careerEducation.id))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map(educationToRecord)
}

export function createCareerEducation(
  executor: CareerDb,
  input: CareerEducationInput,
): CareerWriteResult {
  return executor.transaction((tx) => {
    const content = educationContent(input)
    content.stableKey = requireText(content.stableKey, 'Education stable_key')
    const duplicate = tx
      .select()
      .from(careerEducation)
      .where(eq(careerEducation.stableKey, content.stableKey))
      .get()
    if (duplicate) {
      throw new CareerReferenceError(
        `Career education with stable_key "${content.stableKey}" already exists.`,
      )
    }
    const now = nowISO()
    const inserted = tx
      .insert(careerEducation)
      .values({ ...educationColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerEducation.id })
      .get()
    recordCareerChange(tx, stableFingerprint(content))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerEducation(
  executor: CareerDb,
  id: number,
  input: CareerEducationInput,
  options: UpdateOptions = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireEducation(tx, id)
    assertStableKey('Career education', existing.stableKey, input.stableKey)
    assertExpectedRevision('Career education', id, options.expectedRevision, existing.revision)
    const content = educationContent(input)
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: educationContent(educationToRecord(existing)),
      nextContent: content,
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerEducation)
      .set({
        ...educationColumns(content),
        stableKey: existing.stableKey,
        revision: result.revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerEducation.id, id))
      .run()
    return { id, ...result }
  })
}

function setEducationRetired(executor: CareerDb, id: number, retired: boolean): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireEducation(tx, id)
    const current = educationContent(educationToRecord(existing))
    const next = { ...current, retiredAt: retired ? nowISO() : null }
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: { ...current, retiredAt: existing.retiredAt },
      nextContent: next,
    })
    if (!result.changed) return { id, changed: false, revision: result.revision }
    tx.update(careerEducation)
      .set({ retiredAt: next.retiredAt, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerEducation.id, id))
      .run()
    return { id, changed: true, revision: result.revision }
  })
}

export function retireCareerEducation(executor: CareerDb, id: number): CareerWriteResult {
  return setEducationRetired(executor, id, true)
}

export function restoreCareerEducation(executor: CareerDb, id: number): CareerWriteResult {
  return setEducationRetired(executor, id, false)
}

/** Moves one education record one position up or down the editorial order. */
export function moveCareerEducation(
  executor: CareerDb,
  id: number,
  direction: CareerMoveDirection,
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireEducation(tx, id)
    const move = nextSortOrder(tx.select().from(careerEducation).all(), id, direction)
    if (!move || move.sortOrder === existing.sortOrder) {
      return { id, changed: false, revision: existing.revision }
    }
    const current = educationContent(educationToRecord(existing))
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: current,
      nextContent: { ...current, sortOrder: move.sortOrder },
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerEducation)
      .set({ sortOrder: move.sortOrder, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerEducation.id, id))
      .run()
    return { id, ...result }
  })
}

// ---------------------------------------------------------------------------
// Experiences
// ---------------------------------------------------------------------------

export type CareerExperienceInput = {
  stableKey: string
  company: string
  role: string
  employmentNature?: string | null
  startDate?: string | null
  endDate?: string | null
  datePrecision?: CareerDatePrecision
  displayDates?: string | null
  sortOrder?: number
  context?: string | null
  responsibilities?: string[]
  extension?: unknown
}

export type CareerExperienceRecord = Omit<
  CareerExperience,
  'responsibilitiesJson' | 'extensionJson'
> & {
  responsibilities: string[]
  extension: unknown
}

function experienceContent(source: CareerExperienceInput | CareerExperienceRecord) {
  return {
    stableKey: source.stableKey,
    company: source.company,
    role: source.role,
    employmentNature: source.employmentNature ?? null,
    startDate: source.startDate ?? null,
    endDate: source.endDate ?? null,
    datePrecision: source.datePrecision ?? 'day',
    displayDates: source.displayDates ?? null,
    sortOrder: source.sortOrder ?? 0,
    context: source.context ?? null,
    responsibilities: source.responsibilities ?? [],
    extension: source.extension ?? null,
  }
}

function experienceColumns(content: ReturnType<typeof experienceContent>) {
  return {
    stableKey: content.stableKey,
    company: content.company,
    role: content.role,
    employmentNature: content.employmentNature,
    startDate: content.startDate,
    endDate: content.endDate,
    datePrecision: requireDatePrecision(content.datePrecision),
    displayDates: content.displayDates,
    sortOrder: content.sortOrder,
    context: content.context,
    responsibilitiesJson: serializeJsonColumn(stringListSchema.parse(content.responsibilities)),
    extensionJson:
      content.extension === null
        ? null
        : serializeJsonColumn(extensionSchema.parse(content.extension)),
  }
}

function experienceToRecord(row: CareerExperience): CareerExperienceRecord {
  return {
    ...row,
    responsibilities: parseJsonColumn(
      row.responsibilitiesJson,
      stringListSchema,
      [],
      'career_experiences.responsibilities_json',
    ),
    extension: parseJsonColumn(
      row.extensionJson,
      extensionSchema,
      null,
      'career_experiences.extension_json',
    ),
  }
}

function requireExperienceRecord(tx: CareerDb, id: number): CareerExperience {
  const row = tx.select().from(careerExperiences).where(eq(careerExperiences.id, id)).get()
  if (!row) throw new CareerReferenceError(`Career experience ${id} does not exist.`)
  return row
}

export function listCareerExperiences(
  executor: DbExecutor = db,
  options: ListOptions = {},
): CareerExperienceRecord[] {
  return executor
    .select()
    .from(careerExperiences)
    .orderBy(asc(careerExperiences.sortOrder), asc(careerExperiences.id))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map(experienceToRecord)
}

export function createCareerExperience(
  executor: CareerDb,
  input: CareerExperienceInput,
): CareerWriteResult {
  return executor.transaction((tx) => {
    const content = experienceContent(input)
    content.stableKey = requireText(content.stableKey, 'Experience stable_key')
    const duplicate = tx
      .select()
      .from(careerExperiences)
      .where(eq(careerExperiences.stableKey, content.stableKey))
      .get()
    if (duplicate) {
      throw new CareerReferenceError(
        `Career experience with stable_key "${content.stableKey}" already exists.`,
      )
    }
    const now = nowISO()
    const inserted = tx
      .insert(careerExperiences)
      .values({ ...experienceColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerExperiences.id })
      .get()
    recordCareerChange(tx, stableFingerprint(content))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerExperience(
  executor: CareerDb,
  id: number,
  input: CareerExperienceInput,
  options: UpdateOptions = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireExperienceRecord(tx, id)
    assertStableKey('Career experience', existing.stableKey, input.stableKey)
    assertExpectedRevision('Career experience', id, options.expectedRevision, existing.revision)
    const content = experienceContent(input)
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: experienceContent(experienceToRecord(existing)),
      nextContent: content,
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerExperiences)
      .set({
        ...experienceColumns(content),
        stableKey: existing.stableKey,
        revision: result.revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerExperiences.id, id))
      .run()
    return { id, ...result }
  })
}

function setExperienceRetired(executor: CareerDb, id: number, retired: boolean): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireExperienceRecord(tx, id)
    const current = experienceContent(experienceToRecord(existing))
    const next = { ...current, retiredAt: retired ? nowISO() : null }
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: { ...current, retiredAt: existing.retiredAt },
      nextContent: next,
    })
    if (!result.changed) return { id, changed: false, revision: result.revision }
    tx.update(careerExperiences)
      .set({ retiredAt: next.retiredAt, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerExperiences.id, id))
      .run()
    return { id, changed: true, revision: result.revision }
  })
}

export function retireCareerExperience(executor: CareerDb, id: number): CareerWriteResult {
  return setExperienceRetired(executor, id, true)
}

export function restoreCareerExperience(executor: CareerDb, id: number): CareerWriteResult {
  return setExperienceRetired(executor, id, false)
}

/** Moves one experience one position up or down the editorial order. */
export function moveCareerExperience(
  executor: CareerDb,
  id: number,
  direction: CareerMoveDirection,
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireExperienceRecord(tx, id)
    const move = nextSortOrder(tx.select().from(careerExperiences).all(), id, direction)
    if (!move || move.sortOrder === existing.sortOrder) {
      return { id, changed: false, revision: existing.revision }
    }
    const current = experienceContent(experienceToRecord(existing))
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: current,
      nextContent: { ...current, sortOrder: move.sortOrder },
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerExperiences)
      .set({ sortOrder: move.sortOrder, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerExperiences.id, id))
      .run()
    return { id, ...result }
  })
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export type CareerAchievementInput = {
  stableKey: string
  experienceId?: number | null
  claim: string
  safeToUse?: boolean
  evidence?: string[]
  evidenceNarratives?: string[]
  limitations?: string[]
  skills?: number[]
  directions?: string[]
  publicationIds?: number[]
}

export type CareerAchievementRecord = Omit<
  CareerAchievement,
  'evidenceJson' | 'evidenceNarrativesJson' | 'limitationsJson'
> & {
  evidence: string[]
  evidenceNarratives: string[]
  limitations: string[]
  skills: number[]
  directions: string[]
  publicationIds: number[]
}

type AchievementLinks = { skills: number[]; directions: string[]; publicationIds: number[] }

function achievementContent(
  source: CareerAchievementInput | CareerAchievementRecord,
  links?: AchievementLinks,
) {
  const resolved: AchievementLinks = links ?? {
    skills: source.skills ?? [],
    directions: source.directions ?? [],
    publicationIds: source.publicationIds ?? [],
  }
  return {
    stableKey: source.stableKey,
    experienceId: source.experienceId ?? null,
    claim: source.claim,
    safeToUse: source.safeToUse ?? true,
    evidence: source.evidence ?? [],
    evidenceNarratives: source.evidenceNarratives ?? [],
    limitations: source.limitations ?? [],
    ...resolved,
  }
}

function achievementColumns(content: ReturnType<typeof achievementContent>) {
  return {
    stableKey: content.stableKey,
    experienceId: content.experienceId,
    claim: content.claim,
    safeToUse: content.safeToUse,
    evidenceJson: serializeJsonColumn(stringListSchema.parse(content.evidence)),
    evidenceNarrativesJson: serializeJsonColumn(stringListSchema.parse(content.evidenceNarratives)),
    limitationsJson: serializeJsonColumn(stringListSchema.parse(content.limitations)),
  }
}

function achievementLinks(executor: DbExecutor, achievementId: number): AchievementLinks {
  return {
    skills: executor
      .select()
      .from(careerAchievementSkills)
      .where(eq(careerAchievementSkills.achievementId, achievementId))
      .orderBy(asc(careerAchievementSkills.position))
      .all()
      .map((row) => row.skillId),
    directions: executor
      .select()
      .from(careerAchievementDirections)
      .where(eq(careerAchievementDirections.achievementId, achievementId))
      .orderBy(asc(careerAchievementDirections.position))
      .all()
      .map((row) => row.directionKey),
    publicationIds: executor
      .select()
      .from(careerAchievementPublications)
      .where(eq(careerAchievementPublications.achievementId, achievementId))
      .orderBy(asc(careerAchievementPublications.position))
      .all()
      .map((row) => row.publicationId),
  }
}

function achievementToRecord(
  row: CareerAchievement,
  links: AchievementLinks,
): CareerAchievementRecord {
  return {
    ...row,
    evidence: parseJsonColumn(
      row.evidenceJson,
      stringListSchema,
      [],
      'career_achievements.evidence_json',
    ),
    evidenceNarratives: parseJsonColumn(
      row.evidenceNarrativesJson,
      stringListSchema,
      [],
      'career_achievements.evidence_narratives_json',
    ),
    limitations: parseJsonColumn(
      row.limitationsJson,
      stringListSchema,
      [],
      'career_achievements.limitations_json',
    ),
    ...links,
  }
}

function requireAchievement(tx: CareerDb, id: number): CareerAchievement {
  const row = tx.select().from(careerAchievements).where(eq(careerAchievements.id, id)).get()
  if (!row) throw new CareerReferenceError(`Career achievement ${id} does not exist.`)
  return row
}

function replaceAchievementLinks(
  tx: CareerDb,
  achievementId: number,
  links: AchievementLinks,
): void {
  tx.delete(careerAchievementSkills)
    .where(eq(careerAchievementSkills.achievementId, achievementId))
    .run()
  tx.delete(careerAchievementDirections)
    .where(eq(careerAchievementDirections.achievementId, achievementId))
    .run()
  tx.delete(careerAchievementPublications)
    .where(eq(careerAchievementPublications.achievementId, achievementId))
    .run()
  if (links.skills.length) {
    insertLinks(
      links.skills.map((skillId, position) => ({ achievementId, skillId, position })),
      (row) => tx.insert(careerAchievementSkills).values(row).run(),
    )
  }
  if (links.directions.length) {
    insertLinks(
      links.directions.map((directionKey, position) => ({
        achievementId,
        directionKey,
        position,
      })),
      (row) => tx.insert(careerAchievementDirections).values(row).run(),
    )
  }
  if (links.publicationIds.length) {
    insertLinks(
      links.publicationIds.map((publicationId, position) => ({
        achievementId,
        publicationId,
        position,
      })),
      (row) => tx.insert(careerAchievementPublications).values(row).run(),
    )
  }
}

function validateAchievementLinks(tx: CareerDb, links: AchievementLinks): void {
  requireSkillIds(tx, links.skills)
  requireDirectionKeys(tx, links.directions)
  requirePublicationIds(tx, links.publicationIds)
}

function inputAchievementLinks(input: CareerAchievementInput): AchievementLinks {
  return {
    skills: input.skills ?? [],
    directions: input.directions ?? [],
    publicationIds: input.publicationIds ?? [],
  }
}

export function listCareerAchievements(
  executor: DbExecutor = db,
  options: ListOptions = {},
): CareerAchievementRecord[] {
  return executor
    .select()
    .from(careerAchievements)
    .orderBy(asc(careerAchievements.id))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map((row) => achievementToRecord(row, achievementLinks(executor, row.id)))
}

export function createCareerAchievement(
  executor: CareerDb,
  input: CareerAchievementInput,
): CareerWriteResult {
  return executor.transaction((tx) => {
    requireExperience(tx, input.experienceId)
    if (input.claim.trim() === '') throw new CareerReferenceError('Achievement claim is required.')
    const links = inputAchievementLinks(input)
    validateAchievementLinks(tx, links)
    const content = achievementContent(input, links)
    content.stableKey = requireText(content.stableKey, 'Achievement stable_key')
    const duplicate = tx
      .select()
      .from(careerAchievements)
      .where(eq(careerAchievements.stableKey, content.stableKey))
      .get()
    if (duplicate) {
      throw new CareerReferenceError(
        `Career achievement with stable_key "${content.stableKey}" already exists.`,
      )
    }
    const now = nowISO()
    const inserted = tx
      .insert(careerAchievements)
      .values({ ...achievementColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerAchievements.id })
      .get()
    replaceAchievementLinks(tx, inserted.id, links)
    recordCareerChange(tx, stableFingerprint(content))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerAchievement(
  executor: CareerDb,
  id: number,
  input: CareerAchievementInput,
  options: UpdateOptions = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireAchievement(tx, id)
    assertStableKey('Career achievement', existing.stableKey, input.stableKey)
    assertExpectedRevision('Career achievement', id, options.expectedRevision, existing.revision)
    requireExperience(tx, input.experienceId)
    const links = inputAchievementLinks(input)
    validateAchievementLinks(tx, links)
    const content = achievementContent(input, links)
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: achievementContent(achievementToRecord(existing, achievementLinks(tx, id))),
      nextContent: content,
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerAchievements)
      .set({
        ...achievementColumns(content),
        stableKey: existing.stableKey,
        revision: result.revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerAchievements.id, id))
      .run()
    replaceAchievementLinks(tx, id, links)
    return { id, ...result }
  })
}

function setAchievementRetired(
  executor: CareerDb,
  id: number,
  retired: boolean,
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireAchievement(tx, id)
    const current = achievementContent(achievementToRecord(existing, achievementLinks(tx, id)))
    const next = { ...current, retiredAt: retired ? nowISO() : null }
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: { ...current, retiredAt: existing.retiredAt },
      nextContent: next,
    })
    if (!result.changed) return { id, changed: false, revision: result.revision }
    tx.update(careerAchievements)
      .set({ retiredAt: next.retiredAt, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerAchievements.id, id))
      .run()
    return { id, changed: true, revision: result.revision }
  })
}

export function retireCareerAchievement(executor: CareerDb, id: number): CareerWriteResult {
  return setAchievementRetired(executor, id, true)
}

export function restoreCareerAchievement(executor: CareerDb, id: number): CareerWriteResult {
  return setAchievementRetired(executor, id, false)
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type CareerProjectInput = {
  stableKey: string
  name: string
  experienceId?: number | null
  ownership?: string | null
  eligibility?: CareerProjectEligibility
  completion?: string | null
  urls?: string[]
  safeWording?: string | null
  limitations?: string[]
  skills?: number[]
  directions?: string[]
}

export type CareerProjectRecord = Omit<CareerProject, 'urlsJson' | 'limitationsJson'> & {
  urls: string[]
  limitations: string[]
  skills: number[]
  directions: string[]
}

type ProjectLinks = { skills: number[]; directions: string[] }

function projectContent(source: CareerProjectInput | CareerProjectRecord, links?: ProjectLinks) {
  const resolved: ProjectLinks = links ?? {
    skills: source.skills ?? [],
    directions: source.directions ?? [],
  }
  return {
    stableKey: source.stableKey,
    name: source.name,
    experienceId: source.experienceId ?? null,
    ownership: source.ownership ?? null,
    eligibility: source.eligibility ?? 'resume-eligible',
    completion: source.completion ?? null,
    urls: source.urls ?? [],
    safeWording: source.safeWording ?? null,
    limitations: source.limitations ?? [],
    ...resolved,
  }
}

function projectColumns(content: ReturnType<typeof projectContent>) {
  return {
    stableKey: content.stableKey,
    name: content.name,
    experienceId: content.experienceId,
    ownership: content.ownership,
    eligibility: requireEligibility(content.eligibility),
    completion: content.completion,
    urlsJson: serializeJsonColumn(urlListSchema.parse(content.urls)),
    safeWording: content.safeWording,
    limitationsJson: serializeJsonColumn(stringListSchema.parse(content.limitations)),
  }
}

function projectLinks(executor: DbExecutor, projectId: number): ProjectLinks {
  return {
    skills: executor
      .select()
      .from(careerProjectSkills)
      .where(eq(careerProjectSkills.projectId, projectId))
      .orderBy(asc(careerProjectSkills.position))
      .all()
      .map((row) => row.skillId),
    directions: executor
      .select()
      .from(careerProjectDirections)
      .where(eq(careerProjectDirections.projectId, projectId))
      .orderBy(asc(careerProjectDirections.position))
      .all()
      .map((row) => row.directionKey),
  }
}

function projectToRecord(row: CareerProject, links: ProjectLinks): CareerProjectRecord {
  return {
    ...row,
    urls: parseJsonColumn(row.urlsJson, urlListSchema, [], 'career_projects.urls_json'),
    limitations: parseJsonColumn(
      row.limitationsJson,
      stringListSchema,
      [],
      'career_projects.limitations_json',
    ),
    ...links,
  }
}

function requireProject(tx: CareerDb, id: number): CareerProject {
  const row = tx.select().from(careerProjects).where(eq(careerProjects.id, id)).get()
  if (!row) throw new CareerReferenceError(`Career project ${id} does not exist.`)
  return row
}

function replaceProjectLinks(tx: CareerDb, projectId: number, links: ProjectLinks): void {
  tx.delete(careerProjectSkills).where(eq(careerProjectSkills.projectId, projectId)).run()
  tx.delete(careerProjectDirections).where(eq(careerProjectDirections.projectId, projectId)).run()
  if (links.skills.length) {
    insertLinks(
      links.skills.map((skillId, position) => ({ projectId, skillId, position })),
      (row) => tx.insert(careerProjectSkills).values(row).run(),
    )
  }
  if (links.directions.length) {
    insertLinks(
      links.directions.map((directionKey, position) => ({ projectId, directionKey, position })),
      (row) => tx.insert(careerProjectDirections).values(row).run(),
    )
  }
}

function inputProjectLinks(input: CareerProjectInput): ProjectLinks {
  return { skills: input.skills ?? [], directions: input.directions ?? [] }
}

export function listCareerProjects(
  executor: DbExecutor = db,
  options: ListOptions = {},
): CareerProjectRecord[] {
  return executor
    .select()
    .from(careerProjects)
    .orderBy(asc(careerProjects.id))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map((row) => projectToRecord(row, projectLinks(executor, row.id)))
}

export function createCareerProject(
  executor: CareerDb,
  input: CareerProjectInput,
): CareerWriteResult {
  return executor.transaction((tx) => {
    requireExperience(tx, input.experienceId)
    if (input.name.trim() === '') throw new CareerReferenceError('Project name is required.')
    const links = inputProjectLinks(input)
    requireSkillIds(tx, links.skills)
    requireDirectionKeys(tx, links.directions)
    const content = projectContent(input, links)
    content.stableKey = requireText(content.stableKey, 'Project stable_key')
    const duplicate = tx
      .select()
      .from(careerProjects)
      .where(eq(careerProjects.stableKey, content.stableKey))
      .get()
    if (duplicate) {
      throw new CareerReferenceError(
        `Career project with stable_key "${content.stableKey}" already exists.`,
      )
    }
    const now = nowISO()
    const inserted = tx
      .insert(careerProjects)
      .values({ ...projectColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerProjects.id })
      .get()
    replaceProjectLinks(tx, inserted.id, links)
    recordCareerChange(tx, stableFingerprint(content))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerProject(
  executor: CareerDb,
  id: number,
  input: CareerProjectInput,
  options: UpdateOptions = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireProject(tx, id)
    assertStableKey('Career project', existing.stableKey, input.stableKey)
    assertExpectedRevision('Career project', id, options.expectedRevision, existing.revision)
    requireExperience(tx, input.experienceId)
    const links = inputProjectLinks(input)
    requireSkillIds(tx, links.skills)
    requireDirectionKeys(tx, links.directions)
    const content = projectContent(input, links)
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: projectContent(projectToRecord(existing, projectLinks(tx, id))),
      nextContent: content,
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerProjects)
      .set({
        ...projectColumns(content),
        stableKey: existing.stableKey,
        revision: result.revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerProjects.id, id))
      .run()
    replaceProjectLinks(tx, id, links)
    return { id, ...result }
  })
}

function setProjectRetired(executor: CareerDb, id: number, retired: boolean): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireProject(tx, id)
    const current = projectContent(projectToRecord(existing, projectLinks(tx, id)))
    const next = { ...current, retiredAt: retired ? nowISO() : null }
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: { ...current, retiredAt: existing.retiredAt },
      nextContent: next,
    })
    if (!result.changed) return { id, changed: false, revision: result.revision }
    tx.update(careerProjects)
      .set({ retiredAt: next.retiredAt, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerProjects.id, id))
      .run()
    return { id, changed: true, revision: result.revision }
  })
}

export function retireCareerProject(executor: CareerDb, id: number): CareerWriteResult {
  return setProjectRetired(executor, id, true)
}

export function restoreCareerProject(executor: CareerDb, id: number): CareerWriteResult {
  return setProjectRetired(executor, id, false)
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export type CareerStoryInput = {
  stableKey: string
  experienceId?: number | null
  title: string
  context?: string | null
  situation?: string | null
  task?: string | null
  action?: string | null
  result?: string | null
  narrative?: string | null
  directions?: string[]
}

export type CareerStoryRecord = CareerStory & { directions: string[] }

function storyContent(source: CareerStoryInput | CareerStoryRecord, directions?: string[]) {
  return {
    stableKey: source.stableKey,
    experienceId: source.experienceId ?? null,
    title: source.title,
    context: source.context ?? null,
    situation: source.situation ?? null,
    task: source.task ?? null,
    action: source.action ?? null,
    result: source.result ?? null,
    narrative: source.narrative ?? null,
    directions: directions ?? source.directions ?? [],
  }
}

function storyColumns(content: ReturnType<typeof storyContent>) {
  return {
    stableKey: content.stableKey,
    experienceId: content.experienceId,
    title: content.title,
    context: content.context,
    situation: content.situation,
    task: content.task,
    action: content.action,
    result: content.result,
    narrative: content.narrative,
  }
}

function storyDirections(executor: DbExecutor, storyId: number): string[] {
  return executor
    .select()
    .from(careerStoryDirections)
    .where(eq(careerStoryDirections.storyId, storyId))
    .orderBy(asc(careerStoryDirections.position))
    .all()
    .map((row) => row.directionKey)
}

function storyToRecord(row: CareerStory, directions: string[]): CareerStoryRecord {
  return { ...row, directions }
}

function requireStory(tx: CareerDb, id: number): CareerStory {
  const row = tx.select().from(careerStories).where(eq(careerStories.id, id)).get()
  if (!row) throw new CareerReferenceError(`Career story ${id} does not exist.`)
  return row
}

function replaceStoryDirections(tx: CareerDb, storyId: number, directions: string[]): void {
  tx.delete(careerStoryDirections).where(eq(careerStoryDirections.storyId, storyId)).run()
  if (directions.length) {
    insertLinks(
      directions.map((directionKey, position) => ({ storyId, directionKey, position })),
      (row) => tx.insert(careerStoryDirections).values(row).run(),
    )
  }
}

export function listCareerStories(
  executor: DbExecutor = db,
  options: ListOptions = {},
): CareerStoryRecord[] {
  return executor
    .select()
    .from(careerStories)
    .orderBy(asc(careerStories.id))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map((row) => storyToRecord(row, storyDirections(executor, row.id)))
}

export function createCareerStory(executor: CareerDb, input: CareerStoryInput): CareerWriteResult {
  return executor.transaction((tx) => {
    requireExperience(tx, input.experienceId)
    if (input.title.trim() === '') throw new CareerReferenceError('Story title is required.')
    const directions = input.directions ?? []
    requireDirectionKeys(tx, directions)
    const content = storyContent(input, directions)
    content.stableKey = requireText(content.stableKey, 'Story stable_key')
    const duplicate = tx
      .select()
      .from(careerStories)
      .where(eq(careerStories.stableKey, content.stableKey))
      .get()
    if (duplicate) {
      throw new CareerReferenceError(
        `Career story with stable_key "${content.stableKey}" already exists.`,
      )
    }
    const now = nowISO()
    const inserted = tx
      .insert(careerStories)
      .values({ ...storyColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerStories.id })
      .get()
    replaceStoryDirections(tx, inserted.id, directions)
    recordCareerChange(tx, stableFingerprint(content))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerStory(
  executor: CareerDb,
  id: number,
  input: CareerStoryInput,
  options: UpdateOptions = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireStory(tx, id)
    assertStableKey('Career story', existing.stableKey, input.stableKey)
    assertExpectedRevision('Career story', id, options.expectedRevision, existing.revision)
    requireExperience(tx, input.experienceId)
    const directions = input.directions ?? []
    requireDirectionKeys(tx, directions)
    const content = storyContent(input, directions)
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: storyContent(storyToRecord(existing, storyDirections(tx, id))),
      nextContent: content,
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerStories)
      .set({
        ...storyColumns(content),
        stableKey: existing.stableKey,
        revision: result.revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerStories.id, id))
      .run()
    replaceStoryDirections(tx, id, directions)
    return { id, ...result }
  })
}

function setStoryRetired(executor: CareerDb, id: number, retired: boolean): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireStory(tx, id)
    const current = storyContent(storyToRecord(existing, storyDirections(tx, id)))
    const next = { ...current, retiredAt: retired ? nowISO() : null }
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: { ...current, retiredAt: existing.retiredAt },
      nextContent: next,
    })
    if (!result.changed) return { id, changed: false, revision: result.revision }
    tx.update(careerStories)
      .set({ retiredAt: next.retiredAt, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerStories.id, id))
      .run()
    return { id, changed: true, revision: result.revision }
  })
}

export function retireCareerStory(executor: CareerDb, id: number): CareerWriteResult {
  return setStoryRetired(executor, id, true)
}

export function restoreCareerStory(executor: CareerDb, id: number): CareerWriteResult {
  return setStoryRetired(executor, id, false)
}

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

export type CareerPublicationInput = {
  stableKey: string
  title: string
  citation: string
  year: number
  status: CareerPublicationStatus
  safeToUse?: boolean
  experienceId?: number | null
  authors?: Array<{ name: string; isCandidate: boolean }>
  authorListTruncated?: boolean
  contributions?: string[]
  sourceUrls?: string[]
  projectIds?: number[]
  directions?: string[]
}

export type CareerPublicationRecord = Omit<
  CareerPublication,
  'authorsJson' | 'contributionsJson' | 'sourceUrlsJson'
> & {
  authors: Array<{ name: string; isCandidate: boolean }>
  contributions: string[]
  sourceUrls: string[]
  projectIds: number[]
  directions: string[]
}

type PublicationLinks = { projectIds: number[]; directions: string[] }

function publicationContent(
  source: CareerPublicationInput | CareerPublicationRecord,
  links?: PublicationLinks,
) {
  const resolved: PublicationLinks =
    links ??
    (source.projectIds !== undefined || source.directions !== undefined
      ? { projectIds: source.projectIds ?? [], directions: source.directions ?? [] }
      : { projectIds: [], directions: [] })
  return {
    stableKey: source.stableKey,
    title: source.title,
    citation: source.citation,
    year: source.year,
    status: source.status,
    safeToUse: source.safeToUse ?? true,
    experienceId: source.experienceId ?? null,
    authors: source.authors ?? [],
    authorListTruncated: source.authorListTruncated ?? false,
    contributions: source.contributions ?? [],
    sourceUrls: source.sourceUrls ?? [],
    ...resolved,
  }
}

function publicationColumns(content: ReturnType<typeof publicationContent>) {
  return {
    stableKey: content.stableKey,
    title: content.title,
    citation: content.citation,
    year: requirePublicationYear(content.year),
    status: requirePublicationStatus(content.status),
    safeToUse: content.safeToUse,
    experienceId: content.experienceId,
    authorsJson: serializeJsonColumn(authorsSchema.parse(content.authors)),
    authorListTruncated: content.authorListTruncated,
    contributionsJson: serializeJsonColumn(stringListSchema.parse(content.contributions)),
    sourceUrlsJson: serializeJsonColumn(sourceUrlsSchema.parse(content.sourceUrls)),
  }
}

function publicationLinks(executor: DbExecutor, publicationId: number): PublicationLinks {
  return {
    projectIds: executor
      .select()
      .from(careerPublicationProjects)
      .where(eq(careerPublicationProjects.publicationId, publicationId))
      .orderBy(asc(careerPublicationProjects.position))
      .all()
      .map((row) => row.projectId),
    directions: executor
      .select()
      .from(careerPublicationDirections)
      .where(eq(careerPublicationDirections.publicationId, publicationId))
      .orderBy(asc(careerPublicationDirections.position))
      .all()
      .map((row) => row.directionKey),
  }
}

function publicationToRecord(
  row: CareerPublication,
  links: PublicationLinks,
): CareerPublicationRecord {
  return {
    ...row,
    authors: parseJsonColumn(
      row.authorsJson,
      authorsSchema,
      [],
      'career_publications.authors_json',
    ),
    contributions: parseJsonColumn(
      row.contributionsJson,
      stringListSchema,
      [],
      'career_publications.contributions_json',
    ),
    sourceUrls: parseJsonColumn(
      row.sourceUrlsJson,
      sourceUrlsSchema,
      [],
      'career_publications.source_urls_json',
    ),
    ...links,
  }
}

function requirePublication(tx: CareerDb, id: number): CareerPublication {
  const row = tx.select().from(careerPublications).where(eq(careerPublications.id, id)).get()
  if (!row) throw new CareerReferenceError(`Career publication ${id} does not exist.`)
  return row
}

function replacePublicationLinks(
  tx: CareerDb,
  publicationId: number,
  links: PublicationLinks,
): void {
  tx.delete(careerPublicationProjects)
    .where(eq(careerPublicationProjects.publicationId, publicationId))
    .run()
  tx.delete(careerPublicationDirections)
    .where(eq(careerPublicationDirections.publicationId, publicationId))
    .run()
  if (links.projectIds.length) {
    insertLinks(
      links.projectIds.map((projectId, position) => ({ publicationId, projectId, position })),
      (row) => tx.insert(careerPublicationProjects).values(row).run(),
    )
  }
  if (links.directions.length) {
    insertLinks(
      links.directions.map((directionKey, position) => ({ publicationId, directionKey, position })),
      (row) => tx.insert(careerPublicationDirections).values(row).run(),
    )
  }
}

function inputPublicationLinks(input: CareerPublicationInput): PublicationLinks {
  return { projectIds: input.projectIds ?? [], directions: input.directions ?? [] }
}

export function listCareerPublications(
  executor: DbExecutor = db,
  options: ListOptions = {},
): CareerPublicationRecord[] {
  return executor
    .select()
    .from(careerPublications)
    .orderBy(asc(careerPublications.id))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map((row) => publicationToRecord(row, publicationLinks(executor, row.id)))
}

export function createCareerPublication(
  executor: CareerDb,
  input: CareerPublicationInput,
): CareerWriteResult {
  return executor.transaction((tx) => {
    requireExperience(tx, input.experienceId)
    const links = inputPublicationLinks(input)
    requireProjectIds(tx, links.projectIds)
    requireDirectionKeys(tx, links.directions)
    const content = publicationContent(input, links)
    content.stableKey = requireText(content.stableKey, 'Publication stable_key')
    const duplicate = tx
      .select()
      .from(careerPublications)
      .where(eq(careerPublications.stableKey, content.stableKey))
      .get()
    if (duplicate) {
      throw new CareerReferenceError(
        `Career publication with stable_key "${content.stableKey}" already exists.`,
      )
    }
    const now = nowISO()
    const inserted = tx
      .insert(careerPublications)
      .values({ ...publicationColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerPublications.id })
      .get()
    replacePublicationLinks(tx, inserted.id, links)
    recordCareerChange(tx, stableFingerprint(content))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerPublication(
  executor: CareerDb,
  id: number,
  input: CareerPublicationInput,
  options: UpdateOptions = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requirePublication(tx, id)
    assertStableKey('Career publication', existing.stableKey, input.stableKey)
    assertExpectedRevision('Career publication', id, options.expectedRevision, existing.revision)
    requireExperience(tx, input.experienceId)
    const links = inputPublicationLinks(input)
    requireProjectIds(tx, links.projectIds)
    requireDirectionKeys(tx, links.directions)
    const content = publicationContent(input, links)
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: publicationContent(publicationToRecord(existing, publicationLinks(tx, id))),
      nextContent: content,
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerPublications)
      .set({
        ...publicationColumns(content),
        stableKey: existing.stableKey,
        revision: result.revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerPublications.id, id))
      .run()
    replacePublicationLinks(tx, id, links)
    return { id, ...result }
  })
}

function setPublicationRetired(
  executor: CareerDb,
  id: number,
  retired: boolean,
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requirePublication(tx, id)
    const current = publicationContent(publicationToRecord(existing, publicationLinks(tx, id)))
    const next = { ...current, retiredAt: retired ? nowISO() : null }
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: { ...current, retiredAt: existing.retiredAt },
      nextContent: next,
    })
    if (!result.changed) return { id, changed: false, revision: result.revision }
    tx.update(careerPublications)
      .set({ retiredAt: next.retiredAt, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerPublications.id, id))
      .run()
    return { id, changed: true, revision: result.revision }
  })
}

export function retireCareerPublication(executor: CareerDb, id: number): CareerWriteResult {
  return setPublicationRetired(executor, id, true)
}

export function restoreCareerPublication(executor: CareerDb, id: number): CareerWriteResult {
  return setPublicationRetired(executor, id, false)
}

// ---------------------------------------------------------------------------
// Portfolio topics
// ---------------------------------------------------------------------------

export type CareerPortfolioTopicInput = {
  stableKey: string
  title: string
  status?: string
  sortOrder?: number
  outline?: string[]
  details?: unknown
  projectIds?: number[]
  directions?: string[]
}

export type CareerPortfolioTopicRecord = Omit<
  CareerPortfolioTopic,
  'outlineJson' | 'detailsJson'
> & {
  outline: string[]
  details: unknown
  projectIds: number[]
  directions: string[]
}

type TopicLinks = { projectIds: number[]; directions: string[] }

function topicContent(
  source: CareerPortfolioTopicInput | CareerPortfolioTopicRecord,
  links?: TopicLinks,
) {
  const resolved: TopicLinks =
    links ??
    (source.projectIds !== undefined || source.directions !== undefined
      ? { projectIds: source.projectIds ?? [], directions: source.directions ?? [] }
      : { projectIds: [], directions: [] })
  return {
    stableKey: source.stableKey,
    title: source.title,
    status: source.status ?? 'draft',
    sortOrder: source.sortOrder ?? 0,
    outline: source.outline ?? [],
    details: source.details ?? null,
    ...resolved,
  }
}

function topicColumns(content: ReturnType<typeof topicContent>) {
  return {
    stableKey: content.stableKey,
    title: content.title,
    status: content.status,
    sortOrder: content.sortOrder,
    outlineJson: serializeJsonColumn(stringListSchema.parse(content.outline)),
    detailsJson: content.details === null ? null : serializeJsonColumn(content.details),
  }
}

function topicLinks(executor: DbExecutor, topicId: number): TopicLinks {
  return {
    projectIds: executor
      .select()
      .from(careerPortfolioTopicProjects)
      .where(eq(careerPortfolioTopicProjects.topicId, topicId))
      .orderBy(asc(careerPortfolioTopicProjects.position))
      .all()
      .map((row) => row.projectId),
    directions: executor
      .select()
      .from(careerPortfolioTopicDirections)
      .where(eq(careerPortfolioTopicDirections.topicId, topicId))
      .orderBy(asc(careerPortfolioTopicDirections.position))
      .all()
      .map((row) => row.directionKey),
  }
}

function topicToRecord(row: CareerPortfolioTopic, links: TopicLinks): CareerPortfolioTopicRecord {
  return {
    ...row,
    outline: parseJsonColumn(
      row.outlineJson,
      stringListSchema,
      [],
      'career_portfolio_topics.outline_json',
    ),
    details: parseJsonColumn(
      row.detailsJson,
      jsonValueSchema,
      null,
      'career_portfolio_topics.details_json',
    ),
    ...links,
  }
}

function requireTopic(tx: CareerDb, id: number): CareerPortfolioTopic {
  const row = tx.select().from(careerPortfolioTopics).where(eq(careerPortfolioTopics.id, id)).get()
  if (!row) throw new CareerReferenceError(`Career portfolio topic ${id} does not exist.`)
  return row
}

function replaceTopicLinks(tx: CareerDb, topicId: number, links: TopicLinks): void {
  tx.delete(careerPortfolioTopicProjects)
    .where(eq(careerPortfolioTopicProjects.topicId, topicId))
    .run()
  tx.delete(careerPortfolioTopicDirections)
    .where(eq(careerPortfolioTopicDirections.topicId, topicId))
    .run()
  if (links.projectIds.length) {
    insertLinks(
      links.projectIds.map((projectId, position) => ({ topicId, projectId, position })),
      (row) => tx.insert(careerPortfolioTopicProjects).values(row).run(),
    )
  }
  if (links.directions.length) {
    insertLinks(
      links.directions.map((directionKey, position) => ({ topicId, directionKey, position })),
      (row) => tx.insert(careerPortfolioTopicDirections).values(row).run(),
    )
  }
}

function inputTopicLinks(input: CareerPortfolioTopicInput): TopicLinks {
  return { projectIds: input.projectIds ?? [], directions: input.directions ?? [] }
}

export function listCareerPortfolioTopics(
  executor: DbExecutor = db,
  options: ListOptions = {},
): CareerPortfolioTopicRecord[] {
  return executor
    .select()
    .from(careerPortfolioTopics)
    .orderBy(asc(careerPortfolioTopics.sortOrder), asc(careerPortfolioTopics.id))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map((row) => topicToRecord(row, topicLinks(executor, row.id)))
}

export function createCareerPortfolioTopic(
  executor: CareerDb,
  input: CareerPortfolioTopicInput,
): CareerWriteResult {
  return executor.transaction((tx) => {
    if (input.title.trim() === '')
      throw new CareerReferenceError('Portfolio topic title is required.')
    const links = inputTopicLinks(input)
    requireProjectIds(tx, links.projectIds)
    requireDirectionKeys(tx, links.directions)
    const content = topicContent(input, links)
    content.stableKey = requireText(content.stableKey, 'Portfolio topic stable_key')
    const duplicate = tx
      .select()
      .from(careerPortfolioTopics)
      .where(eq(careerPortfolioTopics.stableKey, content.stableKey))
      .get()
    if (duplicate) {
      throw new CareerReferenceError(
        `Career portfolio topic with stable_key "${content.stableKey}" already exists.`,
      )
    }
    const now = nowISO()
    const inserted = tx
      .insert(careerPortfolioTopics)
      .values({ ...topicColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerPortfolioTopics.id })
      .get()
    replaceTopicLinks(tx, inserted.id, links)
    recordCareerChange(tx, stableFingerprint(content))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerPortfolioTopic(
  executor: CareerDb,
  id: number,
  input: CareerPortfolioTopicInput,
  options: UpdateOptions = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireTopic(tx, id)
    assertStableKey('Career portfolio topic', existing.stableKey, input.stableKey)
    assertExpectedRevision(
      'Career portfolio topic',
      id,
      options.expectedRevision,
      existing.revision,
    )
    const links = inputTopicLinks(input)
    requireProjectIds(tx, links.projectIds)
    requireDirectionKeys(tx, links.directions)
    const content = topicContent(input, links)
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: topicContent(topicToRecord(existing, topicLinks(tx, id))),
      nextContent: content,
    })
    if (!result.changed) return { id, ...result }
    tx.update(careerPortfolioTopics)
      .set({
        ...topicColumns(content),
        stableKey: existing.stableKey,
        revision: result.revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerPortfolioTopics.id, id))
      .run()
    replaceTopicLinks(tx, id, links)
    return { id, ...result }
  })
}

function setTopicRetired(executor: CareerDb, id: number, retired: boolean): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireTopic(tx, id)
    const current = topicContent(topicToRecord(existing, topicLinks(tx, id)))
    const next = { ...current, retiredAt: retired ? nowISO() : null }
    const result = commitRecordWrite({
      tx,
      current: existing,
      currentContent: { ...current, retiredAt: existing.retiredAt },
      nextContent: next,
    })
    if (!result.changed) return { id, changed: false, revision: result.revision }
    tx.update(careerPortfolioTopics)
      .set({ retiredAt: next.retiredAt, revision: result.revision, updatedAt: nowISO() })
      .where(eq(careerPortfolioTopics.id, id))
      .run()
    return { id, changed: true, revision: result.revision }
  })
}

export function retireCareerPortfolioTopic(executor: CareerDb, id: number): CareerWriteResult {
  return setTopicRetired(executor, id, true)
}

export function restoreCareerPortfolioTopic(executor: CareerDb, id: number): CareerWriteResult {
  return setTopicRetired(executor, id, false)
}
