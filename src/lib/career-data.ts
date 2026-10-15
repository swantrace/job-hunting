import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { asc } from 'drizzle-orm'
import { z } from 'zod'
import { listCareerDirections } from '../db/career-directions'
import { readCareerCandidate, readCareerPreferences } from '../db/career-facts'
import {
  listCareerAchievements,
  listCareerEducation,
  listCareerExperiences,
  listCareerPortfolioTopics,
  listCareerProjects,
  listCareerPublications,
  listCareerStories,
} from '../db/career-records'
import { listCareerSkills } from '../db/career-skills'
import { readCareerState, readCareerStateDocuments } from '../db/career-state'
import { db } from '../db/client'
import { skillAliases, skills } from '../db/schema'
import type { DbExecutor } from '../db/skill-queries'
import { isISODate } from './date'
import { normalizeSkillAlias } from './skills/normalize'
import { parseSkillTaxonomy, skillCategoryKeys } from './skills/taxonomy'

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const referenceIdsSchema = z.array(idSchema).superRefine((ids, ctx) => {
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: 'custom', message: 'IDs must not contain duplicates.' })
})
const documentSchema = z.object({ schemaVersion: z.literal(1), lastUpdated: dateSchema })

const candidateSchema = documentSchema
  .extend({
    identity: z.looseObject({ fullName: z.string().min(1), email: z.email().min(1) }),
    education: z.array(
      // Loose on purpose: education rows carry authored extension fields such as
      // `datePrecision` and `coursework`. A strict object silently stripped them.
      z.looseObject({ id: idSchema, degree: z.string().min(1), school: z.string().min(1) }),
    ),
  })
  .loose()
const experiencesSchema = documentSchema.extend({
  experiences: z.array(
    z.looseObject({ id: idSchema, company: z.string().min(1), role: z.string().min(1) }),
  ),
})
const achievementsSchema = documentSchema.extend({
  achievements: z.array(
    z.looseObject({
      id: idSchema,
      experienceId: idSchema.nullable(),
      skills: referenceIdsSchema,
      directions: referenceIdsSchema,
      publicationIds: referenceIdsSchema.optional(),
      safeToUse: z.boolean(),
      evidence: z.array(z.string()),
    }),
  ),
})
const publicationsSchema = documentSchema.extend({
  publications: z.array(
    z.looseObject({
      id: idSchema,
      citation: z.string().trim().min(1),
      title: z.string().trim().min(1),
      year: z.number().int().min(1900).max(2100),
      publicationType: z.enum(['journal-article', 'conference-paper', 'preprint', 'other']),
      status: z.enum(['published', 'in-review', 'preprint', 'needs-verification']),
      authors: z
        .array(z.object({ name: z.string().trim().min(1), isCandidate: z.boolean() }))
        .min(1),
      authorListIsTruncated: z.boolean().optional(),
      experienceId: idSchema.nullable(),
      projectIds: referenceIdsSchema,
      directions: referenceIdsSchema,
      contributions: z.array(z.string().trim().min(1)).default([]),
      sourceUrls: z.array(z.string().url()).default([]),
      safeToUse: z.boolean(),
    }),
  ),
})
const projectsSchema = documentSchema.extend({
  projects: z.array(
    z.looseObject({
      id: idSchema,
      name: z.string().min(1),
      skills: referenceIdsSchema,
      directions: referenceIdsSchema,
    }),
  ),
})
const skillsSchema = documentSchema.extend({
  skills: z.array(
    z.looseObject({
      id: idSchema,
      label: z.string().min(1),
      category: z.string().trim().min(1),
      aliases: z.array(z.string().trim().min(1).max(120)).default([]),
      directions: referenceIdsSchema,
    }),
  ),
})
const storiesSchema = documentSchema.extend({
  stories: z.array(
    z.looseObject({
      id: idSchema,
      experienceId: idSchema.nullable(),
      directions: referenceIdsSchema,
    }),
  ),
})
const preferencesSchema = documentSchema
  .extend({
    directionDefinitions: z.record(
      idSchema,
      z.object({ label: z.string().min(1), targetTitles: z.array(z.string().min(1)).min(1) }),
    ),
  })
  .loose()
const portfolioSchema = documentSchema
  .extend({
    topics: z.array(
      z.looseObject({ id: idSchema, projects: referenceIdsSchema, directions: referenceIdsSchema }),
    ),
  })
  .loose()

export type CanonicalCareerData = {
  candidate: z.infer<typeof candidateSchema>
  experiences: z.infer<typeof experiencesSchema>
  achievements: z.infer<typeof achievementsSchema>
  publications: z.infer<typeof publicationsSchema>
  projects: z.infer<typeof projectsSchema>
  skills: z.infer<typeof skillsSchema>
  stories: z.infer<typeof storiesSchema>
  preferences: z.infer<typeof preferencesSchema>
  portfolio: z.infer<typeof portfolioSchema>
}

/**
 * Resolves the import-only career-data directory from an explicit
 * `CAREER_DATA_DIR` or the conventional locations. Runtime code never calls
 * this: it exists for the Step 3 importer CLI and the retired Step 12 sync
 * tools, which read files on purpose. The database, not this directory, is the
 * runtime authority.
 */
export function careerDataDirectory(env: Record<string, string | undefined> = process.env) {
  const configuredPath = env.CAREER_DATA_DIR?.trim()
  const paths = [
    configuredPath,
    resolve(process.cwd(), 'career-data'),
    resolve(process.cwd(), '..', 'career-data'),
    resolve(process.cwd(), 'career-data.example'),
    resolve(process.cwd(), '..', 'career-data.example'),
  ]
  const path = paths.filter((candidate): candidate is string => Boolean(candidate)).find(existsSync)
  if (!path) throw new Error('career-data directory was not found.')
  return path
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function assertUnique(label: string, values: string[]) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index)
  if (duplicate) throw new Error(`${label} contains duplicate ID "${duplicate}".`)
}

function assertReferences(label: string, values: string[], known: Set<string>) {
  for (const value of values)
    if (!known.has(value)) throw new Error(`${label} references unknown ID "${value}".`)
}

/**
 * Cross-reference validation for the canonical shape. `categoryKeys` defaults
 * to the database-owned catalog categories; the import-only directory reader
 * passes the categories from the taxonomy file it was pointed at.
 */
export function validateCareerData(
  data: CanonicalCareerData,
  categoryKeys: ReadonlySet<string> | null = new Set(skillCategoryKeys()),
) {
  const directionIds = new Set(Object.keys(data.preferences.directionDefinitions))
  const experienceIds = new Set(data.experiences.experiences.map((item) => item.id))
  const achievementIds = new Set(data.achievements.achievements.map((item) => item.id))
  const publicationIds = new Set(data.publications.publications.map((item) => item.id))
  const projectIds = new Set(data.projects.projects.map((item) => item.id))
  const skillIds = new Set(data.skills.skills.map((item) => item.id))
  const storyIds = new Set(data.stories.stories.map((item) => item.id))

  assertUnique(
    'candidate education',
    data.candidate.education.map((item) => item.id),
  )
  assertUnique(
    'experiences',
    data.experiences.experiences.map((item) => item.id),
  )
  assertUnique(
    'achievements',
    data.achievements.achievements.map((item) => item.id),
  )
  assertUnique(
    'publications',
    data.publications.publications.map((item) => item.id),
  )
  assertUnique(
    'projects',
    data.projects.projects.map((item) => item.id),
  )
  assertUnique(
    'skills',
    data.skills.skills.map((item) => item.id),
  )
  const normalizedSkillIds = new Map<string, string>()
  const normalizedSkillLabels = new Map<string, string>()
  for (const skill of data.skills.skills) {
    if (categoryKeys !== null && !categoryKeys.has(skill.category))
      throw new Error(`Skill "${skill.id}" has an invalid category "${skill.category}".`)
    const normalizedId = normalizeSkillAlias(skill.id)
    const idOwner = normalizedSkillIds.get(normalizedId)
    if (idOwner && idOwner !== skill.id)
      throw new Error(
        `Skill "${skill.id}" and skill "${idOwner}" share the normalized id "${normalizedId}".`,
      )
    normalizedSkillIds.set(normalizedId, skill.id)
    const normalizedLabel = normalizeSkillAlias(skill.label)
    const labelOwner = normalizedSkillLabels.get(normalizedLabel)
    if (labelOwner && labelOwner !== skill.id)
      throw new Error(
        `Skill "${skill.id}" and skill "${labelOwner}" share the normalized label "${normalizedLabel}".`,
      )
    normalizedSkillLabels.set(normalizedLabel, skill.id)
  }
  const aliasOwners = new Map<string, string>()
  for (const skill of data.skills.skills) {
    for (const alias of skill.aliases ?? []) {
      const normalizedAlias = normalizeSkillAlias(alias)
      const owner = aliasOwners.get(normalizedAlias)
      if (owner)
        throw new Error(
          `Skill "${skill.id}" and skill "${owner}" share the normalized alias "${normalizedAlias}".`,
        )
      const idOwner = normalizedSkillIds.get(normalizedAlias)
      if (idOwner && idOwner !== skill.id)
        throw new Error(
          `Skill "${skill.id}" alias "${alias}" collides with the id of skill "${idOwner}".`,
        )
      const labelOwner = normalizedSkillLabels.get(normalizedAlias)
      if (labelOwner && labelOwner !== skill.id)
        throw new Error(
          `Skill "${skill.id}" alias "${alias}" collides with the label of skill "${labelOwner}".`,
        )
      aliasOwners.set(normalizedAlias, skill.id)
    }
  }
  assertUnique(
    'stories',
    data.stories.stories.map((item) => item.id),
  )
  assertUnique(
    'portfolio topics',
    data.portfolio.topics.map((item) => item.id),
  )

  for (const item of data.achievements.achievements) {
    if (item.experienceId)
      assertReferences(`achievement ${item.id}`, [item.experienceId], experienceIds)
    assertReferences(`achievement ${item.id} directions`, item.directions, directionIds)
    assertReferences(
      `achievement ${item.id} publications`,
      item.publicationIds ?? [],
      publicationIds,
    )
  }
  for (const item of data.publications.publications) {
    if (item.experienceId)
      assertReferences(`publication ${item.id}`, [item.experienceId], experienceIds)
    assertReferences(`publication ${item.id} projects`, item.projectIds, projectIds)
    assertReferences(`publication ${item.id} directions`, item.directions, directionIds)
    if (!item.authors.some((author) => author.isCandidate))
      throw new Error(`Publication "${item.id}" must identify the candidate in authors.`)
  }
  for (const item of data.projects.projects) {
    assertReferences(`project ${item.id} directions`, item.directions, directionIds)
  }
  for (const item of data.stories.stories) {
    if (item.experienceId) assertReferences(`story ${item.id}`, [item.experienceId], experienceIds)
    assertReferences(`story ${item.id} directions`, item.directions, directionIds)
  }
  for (const item of data.portfolio.topics) {
    assertReferences(`portfolio topic ${item.id} projects`, item.projects, projectIds)
    assertReferences(`portfolio topic ${item.id} directions`, item.directions, directionIds)
  }
  if (directionIds.size === 0)
    throw new Error('preferences.directionDefinitions must define at least one direction.')
  return data
}

const careerDataFiles = [
  'candidate.json',
  'experiences.json',
  'achievements.json',
  'publications.json',
  'projects.json',
  'skills.json',
  'stories.json',
  'preferences.json',
  'portfolio-content.json',
] as const

/**
 * Reads the nine career documents as raw parsed JSON, without any zod coercion
 * or stripping. The explicit importer uses this so every original fact and
 * authored extension field survives the write into SQLite; `loadCareerData`
 * is the database assembler the runtime uses.
 *
 * `publications.json` is optional (matching the loader) and falls back to the
 * empty versioned document.
 */
export function readCareerDocuments(directory: string): Record<string, unknown> {
  return Object.fromEntries(
    careerDataFiles.map((file) => {
      const path = resolve(directory, file)
      if (!existsSync(path)) {
        if (file === 'publications.json') {
          return [file, { schemaVersion: 1, lastUpdated: '1970-01-01', publications: [] }]
        }
        throw new Error(`Career data document "${file}" was not found in ${directory}.`)
      }
      return [file, readJson(path)]
    }),
  )
}

/**
 * Import-only reader: parses and cross-reference-validates one career-data
 * directory (plus its `skill-taxonomy.json` categories). Nothing at runtime
 * reads a directory implicitly; the database assembler below is authoritative.
 */
export function readCareerDataDirectory(directory: string): CanonicalCareerData {
  const parsed: CanonicalCareerData = {
    candidate: candidateSchema.parse(readJson(resolve(directory, 'candidate.json'))),
    experiences: experiencesSchema.parse(readJson(resolve(directory, 'experiences.json'))),
    achievements: achievementsSchema.parse(readJson(resolve(directory, 'achievements.json'))),
    publications: publicationsSchema.parse(
      existsSync(resolve(directory, 'publications.json'))
        ? readJson(resolve(directory, 'publications.json'))
        : { schemaVersion: 1, lastUpdated: '1970-01-01', publications: [] },
    ),
    projects: projectsSchema.parse(readJson(resolve(directory, 'projects.json'))),
    skills: skillsSchema.parse(readJson(resolve(directory, 'skills.json'))),
    stories: storiesSchema.parse(readJson(resolve(directory, 'stories.json'))),
    preferences: preferencesSchema.parse(readJson(resolve(directory, 'preferences.json'))),
    portfolio: portfolioSchema.parse(readJson(resolve(directory, 'portfolio-content.json'))),
  }
  const taxonomyPath = resolve(directory, 'skill-taxonomy.json')
  const categories = existsSync(taxonomyPath)
    ? new Set(parseSkillTaxonomy(readJson(taxonomyPath)).categories.map((item) => item.key))
    : null
  return validateCareerData(parsed, categories)
}

// ---------------------------------------------------------------------------
// Database assembler
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nonEmptyRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value)
  return Object.keys(record).length > 0 ? record : {}
}

/**
 * Document-level metadata (`schemaVersion`, `lastUpdated`) that the relational
 * schema does not model. Legacy source documents are stored in the database by
 * the importer, so reading them here is still a database read — never a
 * filesystem fallback.
 */
function documentMeta(
  legacyDocuments: Record<string, unknown>,
  file: string,
  fallbackDate: string,
): { schemaVersion: 1; lastUpdated: string } {
  const legacy = asRecord(legacyDocuments[file])
  const lastUpdated =
    typeof legacy.lastUpdated === 'string' && isISODate(legacy.lastUpdated)
      ? legacy.lastUpdated
      : fallbackDate
  return { schemaVersion: 1, lastUpdated }
}

/**
 * Assembles the canonical career shape from the relational career tables so no
 * prompt, renderer or schema has to change. Every junction is rendered back
 * into the array field it came from, in stored `position` order, using stable
 * keys; unknown authored fields stored in `career_state` are merged back so a
 * database round trip never drops an extension field.
 */
export function loadCareerDataFromDatabase(executor: DbExecutor = db): CanonicalCareerData {
  const state = readCareerState(executor)
  const documents = readCareerStateDocuments(executor)
  const legacyDocuments = asRecord(documents.legacyDocuments)
  const extension = (kind: string, key: string) => nonEmptyRecord(documents.records[kind]?.[key])
  const fallbackDate = isISODate(state.updatedAt.slice(0, 10))
    ? state.updatedAt.slice(0, 10)
    : '1970-01-01'

  const candidateRow = readCareerCandidate(executor)
  const preferencesRow = readCareerPreferences(executor)
  const directions = listCareerDirections(executor)

  const education = listCareerEducation(executor)
  const experiences = listCareerExperiences(executor)
  const achievements = listCareerAchievements(executor)
  const projects = listCareerProjects(executor)
  const publications = listCareerPublications(executor)
  const stories = listCareerStories(executor)
  const portfolioTopics = listCareerPortfolioTopics(executor)

  const jobSkills = listCareerSkills(executor)
  // Junction rows may reference catalog entries the candidate does not possess,
  // so keys resolve against the whole catalog, not only personal skills.
  const catalogKeyById = new Map(
    executor
      .select({ id: skills.id, key: skills.key })
      .from(skills)
      .all()
      .map((row) => [row.id, row.key] as const),
  )
  const skillKey = (id: number) => catalogKeyById.get(id)
  const aliasRows = executor.select().from(skillAliases).orderBy(asc(skillAliases.id)).all()
  const aliasesBySkillId = new Map<number, string[]>()
  for (const alias of aliasRows) {
    const list = aliasesBySkillId.get(alias.skillId) ?? []
    list.push(alias.alias)
    aliasesBySkillId.set(alias.skillId, list)
  }

  const projectKeyById = new Map(projects.map((row) => [row.id, row.stableKey]))
  const publicationKeyById = new Map(publications.map((row) => [row.id, row.stableKey]))
  const experienceKeyById = new Map(experiences.map((row) => [row.id, row.stableKey]))
  const projectKey = (id: number) => projectKeyById.get(id)
  const publicationKey = (id: number) => publicationKeyById.get(id)
  const experienceKey = (id: number | null) =>
    id === null ? null : (experienceKeyById.get(id) ?? null)

  const candidate = {
    ...documentMeta(legacyDocuments, 'candidate.json', fallbackDate),
    identity: {
      fullName: candidateRow?.fullName ?? '',
      email: candidateRow?.email ?? '',
      phone: candidateRow?.phone ?? null,
      location: candidateRow?.location ?? null,
      website: candidateRow?.website ?? null,
      linkedinUrl: candidateRow?.linkedinUrl ?? null,
      githubUrl: candidateRow?.githubUrl ?? null,
      ...extension('candidate', '$'),
    },
    authorization: candidateRow?.authorization ?? null,
    careerBreak: candidateRow?.careerBreak ?? null,
    truthfulnessRules: candidateRow?.truthfulness ?? null,
    education: education.map((row) => ({
      id: row.stableKey,
      degree: row.degree,
      school: row.school,
      startDate: row.startDate,
      endDate: row.endDate,
      datePrecision: row.datePrecision,
      displayDates: row.displayDates,
      year: row.year,
      sortOrder: row.sortOrder,
      coursework: row.coursework,
      ...(row.details === null ? {} : { details: row.details }),
      ...extension('education', row.stableKey),
    })),
  }

  return {
    candidate,
    experiences: {
      ...documentMeta(legacyDocuments, 'experiences.json', fallbackDate),
      experiences: experiences.map((row) => ({
        id: row.stableKey,
        company: row.company,
        role: row.role,
        employmentNature: row.employmentNature,
        startDate: row.startDate,
        endDate: row.endDate,
        datePrecision: row.datePrecision,
        displayDates: row.displayDates,
        sortOrder: row.sortOrder,
        context: row.context,
        responsibilities: row.responsibilities,
        ...nonEmptyRecord(row.extension),
        ...extension('experiences', row.stableKey),
      })),
    },
    achievements: {
      ...documentMeta(legacyDocuments, 'achievements.json', fallbackDate),
      achievements: achievements.map((row) => ({
        id: row.stableKey,
        experienceId: experienceKey(row.experienceId),
        claim: row.claim,
        safeToUse: row.safeToUse,
        evidence: row.evidence,
        evidenceNarratives: row.evidenceNarratives,
        limitations: row.limitations,
        skills: row.skills.map(skillKey).filter(isDefined),
        directions: row.directions,
        publicationIds: row.publicationIds.map(publicationKey).filter(isDefined),
        ...extension('achievements', row.stableKey),
      })),
    },
    publications: {
      ...documentMeta(legacyDocuments, 'publications.json', fallbackDate),
      publications: publications.map((row) => ({
        id: row.stableKey,
        title: row.title,
        citation: row.citation,
        year: row.year,
        publicationType: String(
          extension('publications', row.stableKey).publicationType ?? 'other',
        ),
        status: row.status,
        safeToUse: row.safeToUse,
        experienceId: experienceKey(row.experienceId),
        authors: row.authors,
        authorListIsTruncated: row.authorListTruncated,
        contributions: row.contributions,
        sourceUrls: row.sourceUrls,
        projectIds: row.projectIds.map(projectKey).filter(isDefined),
        directions: row.directions,
        ...extension('publications', row.stableKey),
      })),
    },
    projects: {
      ...documentMeta(legacyDocuments, 'projects.json', fallbackDate),
      projects: projects.map((row) => ({
        id: row.stableKey,
        name: row.name,
        experienceId: experienceKey(row.experienceId),
        skills: row.skills.map(skillKey).filter(isDefined),
        directions: row.directions,
        ownership: row.ownership,
        eligibility: row.eligibility,
        completion: row.completion,
        urls: row.urls,
        safeWording: row.safeWording,
        limitations: row.limitations,
        ...extension('projects', row.stableKey),
      })),
    },
    skills: {
      ...documentMeta(legacyDocuments, 'skills.json', fallbackDate),
      skills: jobSkills.map((row) => ({
        id: row.skillKey,
        label: row.skillName,
        category: row.category ?? '',
        aliases: aliasesBySkillId.get(row.skillId) ?? [],
        directions: [],
        level: row.level,
        resumeEligible: row.resumeEligible,
        personalExplanation: row.explanation,
        notes: row.notes,
        evidence: row.evidence,
        ...extension('personalSkills', row.skillKey),
      })),
    },
    stories: {
      ...documentMeta(legacyDocuments, 'stories.json', fallbackDate),
      stories: stories.map((row) => ({
        id: row.stableKey,
        experienceId: experienceKey(row.experienceId),
        title: row.title,
        context: row.context,
        situation: row.situation,
        task: row.task,
        action: row.action,
        result: row.result,
        narrative: row.narrative,
        directions: row.directions,
        ...extension('stories', row.stableKey),
      })),
    },
    preferences: {
      ...documentMeta(legacyDocuments, 'preferences.json', fallbackDate),
      directionDefinitions: Object.fromEntries(
        [...directions]
          .sort(
            (left, right) =>
              left.sortOrder - right.sortOrder || left.label.localeCompare(right.label),
          )
          .map((row) => [row.key, { label: row.label, targetTitles: row.targetTitles }]),
      ),
      ...(preferencesRow
        ? {
            careerPreferences: {
              locations: preferencesRow.locations,
              workModes: preferencesRow.workModes,
              availability: preferencesRow.availability,
              compensation: preferencesRow.compensation,
              notes: preferencesRow.notes,
            },
          }
        : {}),
      ...extension('preferences', '$'),
    },
    portfolio: {
      ...documentMeta(legacyDocuments, 'portfolio-content.json', fallbackDate),
      topics: portfolioTopics.map((row) => ({
        id: row.stableKey,
        title: row.title,
        status: row.status,
        sortOrder: row.sortOrder,
        projects: row.projectIds.map(projectKey).filter(isDefined),
        directions: row.directions,
        outline: row.outline,
        details: row.details,
        ...extension('portfolioTopics', row.stableKey),
      })),
    },
  } as CanonicalCareerData
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

let careerDataCache: {
  revision: number
  contentHash: string
  data: CanonicalCareerData
} | null = null

/**
 * Database-owned canonical career data. The relational tables are the sole
 * runtime authority; the result is memoized on `career_state.revision` +
 * `content_hash` so a workspace render does not re-query the whole dataset, and
 * any career write (which bumps the revision) refreshes it on the next call.
 * An empty database yields a well-formed empty shape rather than an error.
 */
export function loadCareerData(executor: DbExecutor = db): CanonicalCareerData {
  const state = readCareerState(executor)
  if (
    careerDataCache &&
    careerDataCache.revision === state.revision &&
    careerDataCache.contentHash === state.contentHash
  ) {
    return careerDataCache.data
  }
  const data = loadCareerDataFromDatabase(executor)
  careerDataCache = { revision: state.revision, contentHash: state.contentHash, data }
  return data
}

export function careerSkillEvidenceMap(executor: DbExecutor = db): Record<string, string[]> {
  try {
    const data = loadCareerData(executor)
    return Object.fromEntries(
      data.skills.skills.map((skill) => {
        const evidence = (skill as Record<string, unknown>).evidence
        return [skill.id, Array.isArray(evidence) ? evidence.map(String) : []]
      }),
    )
  } catch {
    return {}
  }
}

/**
 * Resume-ineligible projects are editorial drafts: they exist in the career data
 * but must never reach a generated document or an evidence allowlist.
 */
export function documentEligibleProjects<T>(projects: T[]): T[] {
  return projects.filter(
    (project) => (project as { eligibility?: unknown }).eligibility === 'resume-eligible',
  )
}

/**
 * The career sources a new document, analysis or ChatGPT context may cite.
 * Retired records never reach `loadCareerDataFromDatabase`, and unsafe
 * achievements/publications plus resume-ineligible projects are removed here, so
 * no prompt, snapshot or evidence allowlist can see them. Narrative text stays
 * attached to its record; only whole ineligible records are dropped.
 */
export function documentSafeCareerData(data: CanonicalCareerData) {
  return {
    candidate: data.candidate,
    experiences: data.experiences.experiences,
    achievements: data.achievements.achievements.filter((item) => item.safeToUse),
    publications: data.publications.publications.filter((item) => item.safeToUse),
    projects: documentEligibleProjects(data.projects.projects),
    skills: data.skills.skills,
    stories: data.stories.stories,
  }
}

/**
 * Reusable catalog of canonical source IDs. Achievements and publications are
 * included only when safeToUse, projects only when resume-eligible; every other
 * catalog is included in full so the candidate-fit service can reject references
 * to unsafe or ineligible sources.
 */
export function careerEvidenceIds(data: CanonicalCareerData) {
  return {
    experience: new Set(data.experiences.experiences.map((item) => item.id)),
    achievement: new Set(
      data.achievements.achievements.filter((item) => item.safeToUse).map((item) => item.id),
    ),
    project: new Set(documentEligibleProjects(data.projects.projects).map((item) => item.id)),
    publication: new Set(
      data.publications.publications.filter((item) => item.safeToUse).map((item) => item.id),
    ),
    skill: new Set(data.skills.skills.map((item) => item.id)),
    story: new Set(data.stories.stories.map((item) => item.id)),
  }
}
