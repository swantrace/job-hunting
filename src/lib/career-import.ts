import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import {
  approveBaseResumeVersion,
  createBaseResumeDraft,
  listBaseResumeVersions,
  supersedeBaseResumeVersion,
} from '../db/career-base-resumes'
import {
  createCareerDirection,
  listCareerDirections,
  retireCareerDirection,
  updateCareerDirection,
} from '../db/career-directions'
import {
  type CareerCandidateInput,
  type CareerPreferencesInput,
  readCareerCandidate,
  readCareerPreferences,
  saveCareerCandidate,
  saveCareerPreferences,
} from '../db/career-facts'
import {
  createCareerAchievement,
  createCareerEducation,
  createCareerExperience,
  createCareerProject,
  createCareerPublication,
  createCareerStory,
  listCareerAchievements,
  listCareerEducation,
  listCareerExperiences,
  listCareerProjects,
  listCareerPublications,
  listCareerStories,
  restoreCareerAchievement,
  restoreCareerEducation,
  restoreCareerExperience,
  restoreCareerProject,
  restoreCareerPublication,
  restoreCareerStory,
  retireCareerAchievement,
  retireCareerEducation,
  retireCareerExperience,
  retireCareerProject,
  retireCareerPublication,
  retireCareerStory,
  updateCareerAchievement,
  updateCareerEducation,
  updateCareerExperience,
  updateCareerProject,
  updateCareerPublication,
  updateCareerStory,
} from '../db/career-records'
import {
  type CareerDb,
  CareerReferenceError,
  careerContentProbe,
  stableFingerprint,
} from '../db/career-shared'
import {
  createCareerSkill,
  listCareerSkills,
  retireCareerSkill,
  updateCareerSkill,
} from '../db/career-skills'
import {
  careerBaseResumes,
  careerDirections,
  careerExperiences,
  careerProfile,
  careerProjects,
  careerPublications,
  skillAliases,
  skillCategories,
  skills,
} from '../db/schema'
import type { DbExecutor } from '../db/skill-queries'
import {
  baseResumeDirectoryName,
  baseResumeManifestFileName,
  baseResumeManifestSchema,
  baseResumeTextHash,
  isEmptyBaseResume,
  parseBaseResumeManifest,
} from './base-resumes'
import {
  type CareerDataset,
  careerDatasetExcluded,
  careerDatasetFormat,
  careerDatasetSchema,
  careerDatasetSchemaVersion,
  documentsSchema,
  parseCareerDataset,
} from './career/dataset'
import { writeRecordExtensions } from './career/extensions'
import type { GenerationRules } from './career/json-schemas'
import { parseJsonColumn, serializeJsonColumn } from './career/json-schemas'
import { readCareerDocuments } from './career-data'
import { nowISO, todayISO } from './date'
import { normalizeSkillAlias } from './skills/normalize'
import { parseSkillTaxonomy } from './skills/taxonomy'

/**
 * Transactional directory/dataset import.
 *
 * `prepareCareerImport` reads, parses and validates the entire source and then
 * runs the same write pipeline inside a transaction that is rolled back, so the
 * preview reports exactly what an apply would do without writing anything. The
 * preview binds the source bytes and the computed career-content fingerprint;
 * `applyCareerImport` refuses a stale preview and then applies everything in one
 * transaction.
 *
 * Merge is by stable key only. A record missing from the source is untouched —
 * an import never deletes — and every cross-record reference is resolved from a
 * portable key to an existing internal id. Ambiguity, unknown references and
 * digest mismatches are conflicts that block the whole apply; nothing is
 * fabricated. Reports contain counts and stable keys only, never personal text.
 */

export type CareerImportSource =
  | { kind: 'directory'; directory: string }
  | { kind: 'dataset'; json: unknown; path?: string }
  /**
   * An uploaded legacy career directory, already read into memory as a file map.
   * The importer never extracts to disk: an uploaded archive is decoded by the
   * caller and handed over as plain data, so uploaded content can never be
   * executed or written outside the intended store.
   */
  | { kind: 'upload'; files: Record<string, string | null> }

export type CareerImportKindCounts = { inserted: number; updated: number; unchanged: number }

export type CareerImportReport = {
  inserted: number
  updated: number
  unchanged: number
  byKind: Record<string, CareerImportKindCounts>
}

export type CareerImportPreview = {
  sourceHash: string
  /**
   * The computed `careerContentProbe` fingerprint of the database the preview
   * was prepared against. It replaces the deleted `career_state.revision`
   * token: the apply re-checks it, both before and inside the transaction.
   */
  databaseRevision: string
  report: CareerImportReport
  conflicts: string[]
  dataset: CareerDataset
  source: CareerImportSource
}

export class CareerImportError extends Error {}
export class CareerImportStaleError extends CareerImportError {}
export class CareerImportConflictError extends CareerImportError {
  constructor(readonly conflicts: string[]) {
    super(`Career import blocked by ${conflicts.length} conflict(s): ${conflicts.join(' ')}`)
  }
}

// ---------------------------------------------------------------------------
// Source reading
// ---------------------------------------------------------------------------

type DirectorySnapshot = {
  documents: Record<string, unknown>
  taxonomy: unknown
  manifest: unknown
  files: Record<string, string | null>
}

/**
 * The legacy career directory files the importer understands, relative to the
 * directory root. Kept here so the filesystem reader and an uploaded archive
 * agree on exactly which entries matter and which are ignored.
 */
export const careerImportDocumentFiles = [
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

export const careerImportTaxonomyFile = 'skill-taxonomy.json'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => String(item))
}

function splitUnknown(
  record: Record<string, unknown>,
  known: ReadonlySet<string>,
): Record<string, unknown> {
  const unknown: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (!known.has(key) && value !== undefined) unknown[key] = value
  }
  return unknown
}

function mergeExtensions(record: unknown, known: ReadonlySet<string>): Record<string, unknown> {
  const source = asRecord(record)
  return { ...asRecord(source.extensions), ...splitUnknown(source, known) }
}

/**
 * Turns an in-memory file map (a legacy directory on disk, or the entries of an
 * uploaded archive) into the same snapshot the directory reader produces. Every
 * value here is inert data: a missing file is named, a file that is not valid
 * JSON throws, and no entry is ever evaluated or written.
 */
function snapshotFromFiles(
  files: Record<string, string | null>,
  missingFile: (file: string) => string,
): DirectorySnapshot {
  const documents: Record<string, unknown> = {}
  for (const file of careerImportDocumentFiles) {
    const content = files[file]
    if (content === undefined) {
      if (file === 'publications.json') {
        documents[file] = { schemaVersion: 1, lastUpdated: '1970-01-01', publications: [] }
        continue
      }
      throw new Error(missingFile(file))
    }
    // A present-but-unreadable document is treated as absent, matching the
    // directory reader's `existsSync` semantics for declared Base Resume files.
    if (content === null) throw new Error(missingFile(file))
    documents[file] = JSON.parse(content)
  }
  const taxonomy = files[careerImportTaxonomyFile]
  const manifest = files[`${baseResumeDirectoryName}/${baseResumeManifestFileName}`]
  return {
    documents,
    taxonomy: taxonomy ? JSON.parse(taxonomy) : null,
    manifest: manifest ? JSON.parse(manifest) : null,
    files,
  }
}

function readDirectorySnapshot(directory: string): DirectorySnapshot {
  const documents = readCareerDocuments(directory)
  const taxonomyPath = resolve(directory, careerImportTaxonomyFile)
  const taxonomy = existsSync(taxonomyPath) ? JSON.parse(readFileSync(taxonomyPath, 'utf8')) : null
  const baseResumesDirectory = resolve(directory, baseResumeDirectoryName)
  const manifestPath = resolve(baseResumesDirectory, baseResumeManifestFileName)
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null
  const files: Record<string, string | null> = {}
  for (const file of careerImportDocumentFiles) {
    const path = resolve(directory, file)
    if (existsSync(path)) files[file] = readFileSync(path, 'utf8')
  }
  if (taxonomy !== null) files[careerImportTaxonomyFile] = readFileSync(taxonomyPath, 'utf8')
  if (manifest !== null)
    files[`${baseResumeDirectoryName}/${baseResumeManifestFileName}`] = readFileSync(
      manifestPath,
      'utf8',
    )
  const parsedManifest = baseResumeManifestSchema.safeParse(manifest)
  if (parsedManifest.success) {
    for (const entry of parsedManifest.data.resumes) {
      const path = resolve(baseResumesDirectory, entry.fileName)
      files[`${baseResumeDirectoryName}/${entry.fileName}`] = existsSync(path)
        ? readFileSync(path, 'utf8')
        : null
    }
  }
  return { documents, taxonomy, manifest, files }
}

// Fields understood by the legacy directory documents. Anything else is an
// authored extension field and is preserved in `extensions` (or `legacyDocuments`).
const rawIdentityFields = new Set([
  'fullName',
  'email',
  'phone',
  'location',
  'website',
  'linkedinUrl',
  'githubUrl',
])
const rawPreferencesFields = new Set([
  'locations',
  'workModes',
  'availability',
  'compensation',
  'notes',
])
const rawEducationFields = new Set([
  'id',
  'degree',
  'school',
  'startDate',
  'endDate',
  'datePrecision',
  'displayDates',
  'year',
  'sortOrder',
  'coursework',
  'additionalDetails',
  'details',
])
const rawExperienceFields = new Set([
  'id',
  'company',
  'role',
  'employmentNature',
  'startDate',
  'endDate',
  'datePrecision',
  'displayDates',
  'sortOrder',
  'context',
  'responsibilities',
])
const rawAchievementFields = new Set([
  'id',
  'experienceId',
  'claim',
  'safeToUse',
  'evidence',
  'evidenceNarratives',
  'limitations',
  'skills',
  'directions',
  'publicationIds',
])
const rawProjectFields = new Set([
  'id',
  'name',
  'experienceId',
  'skills',
  'directions',
  'ownership',
  'eligibility',
  'completion',
  'urls',
  'safeWording',
  'limitations',
])
const rawStoryFields = new Set([
  'id',
  'experienceId',
  'title',
  'context',
  'situation',
  'task',
  'action',
  'result',
  'narrative',
  'directions',
])
// `publicationType` is deliberately absent: the relational schema has no column
// for it, so it is carried as an extension field instead of being dropped.
const rawPublicationFields = new Set([
  'id',
  'title',
  'citation',
  'year',
  'status',
  'authors',
  'authorListIsTruncated',
  'experienceId',
  'projectIds',
  'directions',
  'contributions',
  'sourceUrls',
  'safeToUse',
])
// `directions` is absent on purpose: personal skills have no direction junction,
// so the field is preserved as an extension rather than silently discarded.
const rawPersonalSkillFields = new Set([
  'id',
  'label',
  'category',
  'aliases',
  'level',
  'resumeEligible',
  'personalExplanation',
  'notes',
  'evidence',
])

function extensionsOrUndefined(record: Record<string, unknown>, known: ReadonlySet<string>) {
  const extensions = splitUnknown(record, known)
  return Object.keys(extensions).length > 0 ? extensions : undefined
}

/**
 * Document-root keys that already have a relational home; every other root key
 * of a source document is carried in `career_profile.documents_json`. This
 * mirrors the frozen 0029 migration's `NOT IN (...)` list exactly, so a
 * directory import stores the same document roots the migration carries over.
 */
const modelledDocumentRoots = new Set([
  'identity',
  'education',
  'authorization',
  'careerBreak',
  'truthfulnessRules',
  'directionDefinitions',
  'skills',
  'achievements',
  'experiences',
  'publications',
  'projects',
  'stories',
  'topics',
])

function documentRoots(documents: Record<string, unknown>): Record<string, unknown> {
  const roots: Record<string, unknown> = {}
  for (const [file, document] of Object.entries(documents)) {
    const unmodelled = splitUnknown(asRecord(document), modelledDocumentRoots)
    if (Object.keys(unmodelled).length > 0) roots[file] = unmodelled
  }
  return roots
}

function datasetFromDirectory(snapshot: DirectorySnapshot): CareerDataset {
  const documents = snapshot.documents
  const candidateDocument = asRecord(documents['candidate.json'])
  const identity = asRecord(candidateDocument.identity)
  const preferencesDocument = asRecord(documents['preferences.json'])
  const careerPreferences = asRecord(preferencesDocument.careerPreferences)
  const definitions = asRecord(preferencesDocument.directionDefinitions)

  const directions = Object.entries(definitions).map(([key, definition], index) => {
    const value = asRecord(definition)
    return {
      key,
      label: value.label,
      targetTitles: asStringArray(value.targetTitles),
      rules: null,
      sortOrder: index,
      retiredAt: null,
    }
  })

  const categories =
    snapshot.taxonomy === null
      ? []
      : parseSkillTaxonomy(snapshot.taxonomy).categories.map((category) => ({
          key: category.key,
          label: category.label,
          sortOrder: category.sortOrder,
        }))

  const skillItems = asArray(asRecord(documents['skills.json']).skills)
  const catalog = skillItems.map((item) => {
    const row = asRecord(item)
    return {
      key: row.id,
      name: row.label,
      category: row.category ?? null,
      reviewStatus: 'approved' as const,
      origin: 'career-data' as const,
      aliases: asStringArray(row.aliases),
    }
  })
  const personalSkills = skillItems.map((item) => {
    const row = asRecord(item)
    return {
      skillKey: row.id,
      level: row.level ?? null,
      resumeEligible: row.resumeEligible ?? true,
      explanation: row.personalExplanation ?? null,
      notes: row.notes ?? null,
      evidence: asStringArray(row.evidence),
      retiredAt: null,
      extensions: extensionsOrUndefined(row, rawPersonalSkillFields),
    }
  })

  const education = asArray(candidateDocument.education).map((item, index) => {
    const row = asRecord(item)
    return {
      stableKey: row.id,
      degree: row.degree,
      school: row.school,
      startDate: row.startDate ?? null,
      endDate: row.endDate ?? null,
      datePrecision: row.datePrecision ?? 'day',
      displayDates: row.displayDates ?? null,
      year: row.year ?? null,
      sortOrder: row.sortOrder ?? index,
      coursework: asStringArray(row.coursework),
      details: row.details ?? row.additionalDetails ?? null,
      retiredAt: null,
      extensions: extensionsOrUndefined(row, rawEducationFields),
    }
  })

  const experiences = asArray(asRecord(documents['experiences.json']).experiences).map(
    (item, index) => {
      const row = asRecord(item)
      return {
        stableKey: row.id,
        company: row.company,
        role: row.role,
        employmentNature: row.employmentNature ?? null,
        startDate: row.startDate ?? null,
        endDate: row.endDate ?? null,
        datePrecision: row.datePrecision ?? 'day',
        displayDates: row.displayDates ?? null,
        sortOrder: row.sortOrder ?? index,
        context: row.context ?? null,
        responsibilities: asStringArray(row.responsibilities),
        retiredAt: null,
        extensions: extensionsOrUndefined(row, rawExperienceFields),
      }
    },
  )

  const achievements = asArray(asRecord(documents['achievements.json']).achievements).map(
    (item) => {
      const row = asRecord(item)
      return {
        stableKey: row.id,
        experienceKey: row.experienceId ?? null,
        claim: row.claim,
        safeToUse: row.safeToUse ?? true,
        evidence: asStringArray(row.evidence),
        evidenceNarratives: asStringArray(row.evidenceNarratives),
        limitations: asStringArray(row.limitations),
        skillKeys: asStringArray(row.skills),
        directionKeys: asStringArray(row.directions),
        publicationKeys: asStringArray(row.publicationIds),
        retiredAt: null,
        extensions: extensionsOrUndefined(row, rawAchievementFields),
      }
    },
  )

  const projects = asArray(asRecord(documents['projects.json']).projects).map((item) => {
    const row = asRecord(item)
    return {
      stableKey: row.id,
      name: row.name,
      experienceKey: row.experienceId ?? null,
      ownership: row.ownership ?? null,
      eligibility: row.eligibility ?? 'resume-eligible',
      completion: row.completion ?? null,
      urls: asStringArray(row.urls),
      safeWording: row.safeWording ?? null,
      limitations: asStringArray(row.limitations),
      skillKeys: asStringArray(row.skills),
      directionKeys: asStringArray(row.directions),
      retiredAt: null,
      extensions: extensionsOrUndefined(row, rawProjectFields),
    }
  })

  const stories = asArray(asRecord(documents['stories.json']).stories).map((item) => {
    const row = asRecord(item)
    return {
      stableKey: row.id,
      experienceKey: row.experienceId ?? null,
      title: row.title,
      context: row.context ?? null,
      situation: row.situation ?? null,
      task: row.task ?? null,
      action: row.action ?? null,
      result: row.result ?? null,
      narrative: row.narrative ?? null,
      directionKeys: asStringArray(row.directions),
      retiredAt: null,
      extensions: extensionsOrUndefined(row, rawStoryFields),
    }
  })

  const publications = asArray(asRecord(documents['publications.json']).publications).map(
    (item) => {
      const row = asRecord(item)
      return {
        stableKey: row.id,
        title: row.title,
        citation: row.citation,
        year: row.year,
        status: row.status,
        safeToUse: row.safeToUse ?? true,
        experienceKey: row.experienceId ?? null,
        authors: asArray(row.authors),
        authorListTruncated: row.authorListIsTruncated ?? false,
        contributions: asStringArray(row.contributions),
        sourceUrls: asStringArray(row.sourceUrls),
        projectKeys: asStringArray(row.projectIds),
        directionKeys: asStringArray(row.directions),
        retiredAt: null,
        extensions: extensionsOrUndefined(row, rawPublicationFields),
      }
    },
  )

  const knownDirectionIds = new Set(directions.map((direction) => direction.key))
  const baseResumes = snapshot.manifest
    ? parseBaseResumeManifest(snapshot.manifest, knownDirectionIds).resumes.map((entry) => ({
        directionKey: entry.direction,
        version: entry.version,
        status: 'approved' as const,
        markdown: snapshot.files[`${baseResumeDirectoryName}/${entry.fileName}`] ?? '',
        contentHash: entry.sha256,
        approvedAt: entry.approvedAt,
      }))
    : []

  const candidate = {
    fullName: identity.fullName,
    email: identity.email ?? null,
    phone: identity.phone ?? null,
    location: identity.location ?? null,
    website: identity.website ?? null,
    linkedinUrl: identity.linkedinUrl ?? null,
    githubUrl: identity.githubUrl ?? null,
    authorization: candidateDocument.authorization ?? null,
    careerBreak: candidateDocument.careerBreak ?? null,
    truthfulness: candidateDocument.truthfulnessRules ?? candidateDocument.truthfulness ?? null,
    extensions: extensionsOrUndefined(identity, rawIdentityFields),
  }

  const preferences = {
    locations: asStringArray(careerPreferences.locations),
    workModes: asStringArray(careerPreferences.workModes),
    availability: careerPreferences.availability ?? null,
    compensation: careerPreferences.compensation ?? null,
    notes: careerPreferences.notes ?? null,
    extensions: extensionsOrUndefined(careerPreferences, rawPreferencesFields),
  }

  return careerDatasetSchema.parse({
    format: careerDatasetFormat,
    schemaVersion: careerDatasetSchemaVersion,
    exportedAt: nowISO(),
    scope: { kind: 'full' },
    categories,
    catalog,
    candidate,
    preferences,
    education,
    experiences,
    achievements,
    projects,
    stories,
    publications,
    personalSkills,
    directions,
    baseResumes,
    documents: documentRoots(documents),
    excluded: careerDatasetExcluded,
  })
}

const uploadedMissingFile = (file: string) => `The uploaded career directory is missing "${file}".`

function sourceSnapshot(source: CareerImportSource): DirectorySnapshot | null {
  if (source.kind === 'directory') return readDirectorySnapshot(source.directory)
  if (source.kind === 'upload') return snapshotFromFiles(source.files, uploadedMissingFile)
  return null
}

function readSource(source: CareerImportSource): { dataset: CareerDataset; sourceHash: string } {
  const snapshot = sourceSnapshot(source)
  if (snapshot) {
    return {
      dataset: datasetFromDirectory(snapshot),
      sourceHash: stableFingerprint(snapshot),
    }
  }
  if (source.kind !== 'dataset') throw new Error('Unsupported career import source.')
  const json = source.path ? JSON.parse(readFileSync(source.path, 'utf8')) : source.json
  return { dataset: parseCareerDataset(json), sourceHash: stableFingerprint(json) }
}

function careerSourceHash(source: CareerImportSource): string {
  const snapshot = sourceSnapshot(source)
  if (snapshot) return stableFingerprint(snapshot)
  if (source.kind !== 'dataset') throw new Error('Unsupported career import source.')
  const json = source.path ? JSON.parse(readFileSync(source.path, 'utf8')) : source.json
  return stableFingerprint(json)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function dedupeConflicts(conflicts: string[]): string[] {
  return [...new Set(conflicts)]
}

function checkDuplicates(kind: string, keys: string[], conflicts: string[]) {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) conflicts.push(`${kind} contains duplicate stable key "${key}".`)
    seen.add(key)
  }
}

export function validateCareerImport(executor: DbExecutor, dataset: CareerDataset): string[] {
  const conflicts: string[] = []

  checkDuplicates(
    'catalog',
    dataset.catalog.map((entry) => entry.key),
    conflicts,
  )
  checkDuplicates(
    'directions',
    dataset.directions.map((entry) => entry.key),
    conflicts,
  )
  checkDuplicates(
    'categories',
    dataset.categories.map((entry) => entry.key),
    conflicts,
  )
  checkDuplicates(
    'education',
    dataset.education.map((entry) => entry.stableKey),
    conflicts,
  )
  checkDuplicates(
    'experiences',
    dataset.experiences.map((entry) => entry.stableKey),
    conflicts,
  )
  checkDuplicates(
    'achievements',
    dataset.achievements.map((entry) => entry.stableKey),
    conflicts,
  )
  checkDuplicates(
    'projects',
    dataset.projects.map((entry) => entry.stableKey),
    conflicts,
  )
  checkDuplicates(
    'stories',
    dataset.stories.map((entry) => entry.stableKey),
    conflicts,
  )
  checkDuplicates(
    'publications',
    dataset.publications.map((entry) => entry.stableKey),
    conflicts,
  )
  checkDuplicates(
    'personalSkills',
    dataset.personalSkills.map((entry) => entry.skillKey),
    conflicts,
  )
  checkDuplicates(
    'baseResumes',
    dataset.baseResumes.map((entry) => `${entry.directionKey}#${entry.version}`),
    conflicts,
  )

  const dbCategories = new Set(
    executor
      .select()
      .from(skillCategories)
      .all()
      .map((row) => row.key),
  )
  const sourceCategoryKeys = new Set(dataset.categories.map((entry) => entry.key))
  for (const entry of dataset.catalog) {
    if (entry.category === null) continue
    if (!sourceCategoryKeys.has(entry.category) && !dbCategories.has(entry.category)) {
      conflicts.push(
        `Catalog skill "${entry.key}" references unknown category "${entry.category}".`,
      )
    }
  }

  const dbSkills = executor.select().from(skills).all()
  const dbSkillByKey = new Map(dbSkills.map((row) => [row.key, row]))
  const dbSkillById = new Map(dbSkills.map((row) => [row.id, row]))
  const dbAliasByNormalized = new Map(
    executor
      .select()
      .from(skillAliases)
      .all()
      .map((row) => [row.normalizedAlias, row]),
  )
  const dbSkillByNormalizedName = new Map(
    dbSkills.map((row) => [normalizeSkillAlias(row.name), row]),
  )
  const dbSkillByNormalizedKey = new Map(dbSkills.map((row) => [normalizeSkillAlias(row.key), row]))

  const sourceNameOwner = new Map<string, string>()
  for (const entry of dataset.catalog) {
    const normalizedName = normalizeSkillAlias(entry.name)
    const owner = sourceNameOwner.get(normalizedName)
    if (owner && owner !== entry.key) {
      conflicts.push(
        `Catalog skills "${owner}" and "${entry.key}" share the display name "${entry.name}".`,
      )
    } else {
      sourceNameOwner.set(normalizedName, entry.key)
    }
  }
  const aliasOwner = new Map<string, string>()
  const keyOwner = new Map(
    dataset.catalog.map((entry) => [normalizeSkillAlias(entry.key), entry.key]),
  )
  for (const entry of dataset.catalog) {
    for (const alias of entry.aliases ?? []) {
      const normalized = normalizeSkillAlias(alias)
      const nameClaim = sourceNameOwner.get(normalized)
      if (nameClaim && nameClaim !== entry.key) {
        conflicts.push(
          `Catalog skill "${entry.key}" alias "${alias}" collides with the display name of skill "${nameClaim}".`,
        )
      }
      const keyClaim = keyOwner.get(normalized)
      if (keyClaim && keyClaim !== entry.key) {
        conflicts.push(
          `Catalog skill "${entry.key}" alias "${alias}" collides with the key of skill "${keyClaim}".`,
        )
      }
      const claim = aliasOwner.get(normalized)
      if (claim && claim !== entry.key) {
        conflicts.push(
          `Catalog skills "${claim}" and "${entry.key}" share the normalized alias "${normalized}".`,
        )
      } else {
        aliasOwner.set(normalized, entry.key)
      }
      const dbAlias = dbAliasByNormalized.get(normalized)
      if (dbAlias) {
        const owner = dbSkillById.get(dbAlias.skillId)
        if (owner && owner.key !== entry.key) {
          conflicts.push(
            `Alias "${alias}" is already assigned to existing catalog skill "${owner.key}".`,
          )
        }
      } else {
        const dbName = dbSkillByNormalizedName.get(normalized)
        if (dbName && dbName.key !== entry.key) {
          conflicts.push(
            `Alias "${alias}" collides with the display name of existing catalog skill "${dbName.key}".`,
          )
        }
        const dbKey = dbSkillByNormalizedKey.get(normalized)
        if (dbKey && dbKey.key !== entry.key) {
          conflicts.push(
            `Alias "${alias}" collides with the key of existing catalog skill "${dbKey.key}".`,
          )
        }
      }
    }
  }

  const sourceCatalogByKey = new Map(dataset.catalog.map((entry) => [entry.key, entry]))
  for (const entry of dataset.catalog) {
    if (entry.reviewStatus === 'merged' && !entry.mergedIntoKey) {
      conflicts.push(`Catalog skill "${entry.key}" is merged but has no merge target.`)
    }
    if (entry.reviewStatus !== 'merged' && entry.mergedIntoKey) {
      conflicts.push(
        `Catalog skill "${entry.key}" has a merge target but is not merged; import cannot guess which is authoritative.`,
      )
    }
  }

  const knownSkillKeys = new Set([...sourceCatalogByKey.keys(), ...dbSkillByKey.keys()])
  const knownExperienceKeys = new Set([
    ...dataset.experiences.map((entry) => entry.stableKey),
    ...executor
      .select()
      .from(careerExperiences)
      .all()
      .map((row) => row.stableKey),
  ])
  const knownProjectKeys = new Set([
    ...dataset.projects.map((entry) => entry.stableKey),
    ...executor
      .select()
      .from(careerProjects)
      .all()
      .map((row) => row.stableKey),
  ])
  const knownPublicationKeys = new Set([
    ...dataset.publications.map((entry) => entry.stableKey),
    ...executor
      .select()
      .from(careerPublications)
      .all()
      .map((row) => row.stableKey),
  ])
  const knownDirectionKeys = new Set([
    ...dataset.directions.map((entry) => entry.key),
    ...executor
      .select()
      .from(careerDirections)
      .all()
      .map((row) => row.key),
  ])

  const skillReviewStatus = (key: string) =>
    sourceCatalogByKey.get(key)?.reviewStatus ?? dbSkillByKey.get(key)?.reviewStatus

  const checkRef = (
    label: string,
    values: string[] | undefined,
    known: Set<string>,
    kind: string,
  ) => {
    for (const value of values ?? []) {
      if (!known.has(value)) conflicts.push(`${label} references unknown ${kind} "${value}".`)
    }
  }
  const checkSkillRefs = (label: string, values: string[] | undefined) => {
    for (const value of values ?? []) {
      if (!knownSkillKeys.has(value)) {
        conflicts.push(`${label} references unknown catalog skill "${value}".`)
        continue
      }
      if (skillReviewStatus(value) === 'merged') {
        conflicts.push(`${label} references merged catalog skill "${value}".`)
      }
    }
  }

  for (const entry of dataset.achievements) {
    const label = `Achievement "${entry.stableKey}"`
    if (entry.experienceKey)
      checkRef(label, [entry.experienceKey], knownExperienceKeys, 'experience')
    checkSkillRefs(label, entry.skillKeys)
    checkRef(label, entry.directionKeys, knownDirectionKeys, 'direction')
    checkRef(label, entry.publicationKeys, knownPublicationKeys, 'publication')
  }
  for (const entry of dataset.projects) {
    const label = `Project "${entry.stableKey}"`
    if (entry.experienceKey)
      checkRef(label, [entry.experienceKey], knownExperienceKeys, 'experience')
    checkSkillRefs(label, entry.skillKeys)
    checkRef(label, entry.directionKeys, knownDirectionKeys, 'direction')
  }
  for (const entry of dataset.stories) {
    const label = `Story "${entry.stableKey}"`
    if (entry.experienceKey)
      checkRef(label, [entry.experienceKey], knownExperienceKeys, 'experience')
    checkRef(label, entry.directionKeys, knownDirectionKeys, 'direction')
  }
  for (const entry of dataset.publications) {
    const label = `Publication "${entry.stableKey}"`
    if (entry.experienceKey)
      checkRef(label, [entry.experienceKey], knownExperienceKeys, 'experience')
    checkRef(label, entry.projectKeys, knownProjectKeys, 'project')
    checkRef(label, entry.directionKeys, knownDirectionKeys, 'direction')
  }
  for (const entry of dataset.personalSkills) {
    const label = `Personal skill "${entry.skillKey}"`
    if (!knownSkillKeys.has(entry.skillKey)) {
      conflicts.push(`${label} references unknown catalog skill.`)
      continue
    }
    const status = skillReviewStatus(entry.skillKey)
    if (status !== 'approved') {
      conflicts.push(
        `${label} requires an approved catalog skill; "${entry.skillKey}" is ${status ?? 'unknown'}.`,
      )
    }
  }
  for (const entry of dataset.catalog) {
    if (entry.mergedIntoKey && !knownSkillKeys.has(entry.mergedIntoKey)) {
      conflicts.push(
        `Catalog skill "${entry.key}" merges into unknown skill "${entry.mergedIntoKey}".`,
      )
    }
  }

  const dbBaseResumes = dataset.baseResumes.length
    ? executor.select().from(careerBaseResumes).all()
    : []
  for (const entry of dataset.baseResumes) {
    const label = `Base Resume "${entry.directionKey}#${entry.version}"`
    if (!knownDirectionKeys.has(entry.directionKey)) {
      conflicts.push(`${label} references unknown direction "${entry.directionKey}".`)
    }
    if (isEmptyBaseResume(entry.markdown)) {
      conflicts.push(`${label} Markdown is missing or empty.`)
    } else if (baseResumeTextHash(entry.markdown) !== entry.contentHash) {
      conflicts.push(
        `${label} digest does not match its Markdown; the recorded hash is not reproducible.`,
      )
    }
    if (entry.status === 'approved' && !entry.approvedAt) {
      conflicts.push(`${label} is approved but has no approval date.`)
    }
    const existing = dbBaseResumes.find(
      (row) => row.directionKey === entry.directionKey && row.version === entry.version,
    )
    if (existing && existing.contentHash !== entry.contentHash) {
      conflicts.push(
        `${label} already exists with a different content hash; versions are immutable.`,
      )
    }
  }

  return dedupeConflicts(conflicts)
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const categoryFields = new Set(['key', 'label', 'sortOrder', 'extensions'])
const catalogFields = new Set([
  'key',
  'name',
  'category',
  'reviewStatus',
  'origin',
  'aliases',
  'mergedIntoKey',
  'extensions',
])
const candidateFields = new Set([
  'fullName',
  'email',
  'phone',
  'location',
  'website',
  'linkedinUrl',
  'githubUrl',
  'authorization',
  'careerBreak',
  'truthfulness',
  'extensions',
])
const preferencesFields = new Set([
  'locations',
  'workModes',
  'availability',
  'compensation',
  'notes',
  'extensions',
])
const educationFields = new Set([
  'stableKey',
  'degree',
  'school',
  'startDate',
  'endDate',
  'datePrecision',
  'displayDates',
  'year',
  'sortOrder',
  'coursework',
  'details',
  'retiredAt',
  'extensions',
])
const experienceFields = new Set([
  'stableKey',
  'company',
  'role',
  'employmentNature',
  'startDate',
  'endDate',
  'datePrecision',
  'displayDates',
  'sortOrder',
  'context',
  'responsibilities',
  'retiredAt',
  'extensions',
])
const achievementFields = new Set([
  'stableKey',
  'experienceKey',
  'claim',
  'safeToUse',
  'evidence',
  'evidenceNarratives',
  'limitations',
  'skillKeys',
  'directionKeys',
  'publicationKeys',
  'retiredAt',
  'extensions',
])
const projectFields = new Set([
  'stableKey',
  'name',
  'experienceKey',
  'ownership',
  'eligibility',
  'completion',
  'urls',
  'safeWording',
  'limitations',
  'skillKeys',
  'directionKeys',
  'retiredAt',
  'extensions',
])
const storyFields = new Set([
  'stableKey',
  'experienceKey',
  'title',
  'context',
  'situation',
  'task',
  'action',
  'result',
  'narrative',
  'directionKeys',
  'retiredAt',
  'extensions',
])
const publicationFields = new Set([
  'stableKey',
  'title',
  'citation',
  'year',
  'status',
  'safeToUse',
  'experienceKey',
  'authors',
  'authorListTruncated',
  'contributions',
  'sourceUrls',
  'projectKeys',
  'directionKeys',
  'retiredAt',
  'extensions',
])
const personalSkillFields = new Set([
  'skillKey',
  'level',
  'resumeEligible',
  'explanation',
  'notes',
  'evidence',
  'retiredAt',
  'extensions',
])
const directionFields = new Set([
  'key',
  'label',
  'targetTitles',
  'rules',
  'sortOrder',
  'retiredAt',
  'extensions',
])
const baseResumeFields = new Set([
  'directionKey',
  'version',
  'status',
  'markdown',
  'contentHash',
  'approvedAt',
  'extensions',
])

type Action = 'inserted' | 'updated' | 'unchanged'

function emptyReport(): CareerImportReport {
  return { inserted: 0, updated: 0, unchanged: 0, byKind: {} }
}

function addCount(report: CareerImportReport, kind: string, action: Action) {
  const counts = report.byKind[kind] ?? { inserted: 0, updated: 0, unchanged: 0 }
  counts[action] += 1
  report.byKind[kind] = counts
  report[action] += 1
}

function resolveId(
  map: Map<string, number>,
  key: string | null | undefined,
  label: string,
): number | null {
  if (key === null || key === undefined) return null
  const id = map.get(key)
  if (id === undefined) throw new CareerReferenceError(`${label} "${key}" was not found.`)
  return id
}

function syncRetirement(
  currentRetiredAt: string | null,
  desiredRetiredAt: string | null | undefined,
  retire: () => void,
  restore: (() => void) | null,
): boolean {
  if (desiredRetiredAt && currentRetiredAt === null) {
    retire()
    return true
  }
  if (!desiredRetiredAt && currentRetiredAt !== null && restore) {
    restore()
    return true
  }
  return false
}

const singletonKey = '$'

export function applyCareerDataset(executor: CareerDb, dataset: CareerDataset): CareerImportReport {
  const report = emptyReport()
  const now = nowISO()
  /**
   * Per-record authored extras, collected while the records are written and
   * persisted into each owning row's `extension_json` column at the end, once
   * every row exists. Kinds with no extension column (categories, catalog,
   * directions) are collected but have nowhere to land — the frozen migration
   * gave them no column, so they are dropped.
   */
  const extensions: Record<string, Record<string, unknown>> = {}
  const setExtensions = (kind: string, key: string, value: Record<string, unknown> | undefined) => {
    if (!value || Object.keys(value).length === 0) return
    extensions[kind] = { ...(extensions[kind] ?? {}), [key]: value }
  }

  // Categories.
  const existingCategories = new Map(
    executor
      .select()
      .from(skillCategories)
      .all()
      .map((row) => [row.key, row]),
  )
  for (const entry of dataset.categories) {
    setExtensions('categories', entry.key, mergeExtensions(entry, categoryFields))
    const current = existingCategories.get(entry.key)
    if (!current) {
      executor
        .insert(skillCategories)
        .values({
          key: entry.key,
          label: entry.label,
          sortOrder: entry.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      addCount(report, 'categories', 'inserted')
    } else if (current.label !== entry.label || current.sortOrder !== entry.sortOrder) {
      executor
        .update(skillCategories)
        .set({ label: entry.label, sortOrder: entry.sortOrder, updatedAt: now })
        .where(eq(skillCategories.key, entry.key))
        .run()
      addCount(report, 'categories', 'updated')
    } else {
      addCount(report, 'categories', 'unchanged')
    }
  }

  // Catalog. Non-merged entries are written first so merge targets resolve to
  // real ids; merged entries follow.
  const skillsByKey = new Map(
    executor
      .select()
      .from(skills)
      .all()
      .map((row) => [row.key, row]),
  )
  const aliasesByNormalized = new Map(
    executor
      .select()
      .from(skillAliases)
      .all()
      .map((row) => [row.normalizedAlias, row]),
  )
  const orderedCatalog = [
    ...dataset.catalog.filter((entry) => entry.reviewStatus !== 'merged'),
    ...dataset.catalog.filter((entry) => entry.reviewStatus === 'merged'),
  ]
  for (const entry of orderedCatalog) {
    setExtensions('catalog', entry.key, mergeExtensions(entry, catalogFields))
    let skill = skillsByKey.get(entry.key)
    let action: Action = 'unchanged'
    const mergedIntoId = entry.mergedIntoKey
      ? (skillsByKey.get(entry.mergedIntoKey)?.id ?? null)
      : null
    if (!skill) {
      const inserted = executor
        .insert(skills)
        .values({
          key: entry.key,
          name: entry.name,
          category: entry.category,
          reviewStatus: entry.reviewStatus,
          origin: entry.origin,
          mergedIntoSkillId: mergedIntoId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      skillsByKey.set(entry.key, inserted)
      skill = inserted
      action = 'inserted'
    } else {
      const changed =
        skill.name !== entry.name ||
        skill.category !== entry.category ||
        skill.reviewStatus !== entry.reviewStatus ||
        skill.origin !== entry.origin ||
        (skill.mergedIntoSkillId ?? null) !== mergedIntoId
      if (changed) {
        executor
          .update(skills)
          .set({
            name: entry.name,
            category: entry.category,
            reviewStatus: entry.reviewStatus,
            origin: entry.origin,
            mergedIntoSkillId: mergedIntoId,
            updatedAt: now,
          })
          .where(eq(skills.id, skill.id))
          .run()
        skillsByKey.set(entry.key, { ...skill, name: entry.name, category: entry.category })
        action = 'updated'
      }
    }
    let aliasAdded = false
    for (const alias of entry.aliases ?? []) {
      const normalizedAlias = normalizeSkillAlias(alias)
      if (aliasesByNormalized.has(normalizedAlias)) continue
      executor
        .insert(skillAliases)
        .values({
          skillId: skill.id,
          alias,
          normalizedAlias,
          origin: entry.origin,
          createdAt: now,
        })
        .run()
      aliasesByNormalized.set(normalizedAlias, {
        id: -1,
        skillId: skill.id,
        alias,
        normalizedAlias,
        origin: entry.origin,
        createdAt: now,
      })
      aliasAdded = true
    }
    if (action === 'inserted') addCount(report, 'catalog', 'inserted')
    else if (action === 'updated' || aliasAdded) addCount(report, 'catalog', 'updated')
    else addCount(report, 'catalog', 'unchanged')
  }
  const skillIdByKey = new Map(
    executor
      .select()
      .from(skills)
      .all()
      .map((row) => [row.key, row.id]),
  )
  const skillIds = (keys: string[] | undefined) =>
    (keys ?? []).map((key) => {
      const id = skillIdByKey.get(key)
      if (id === undefined) throw new CareerReferenceError(`Unknown catalog skill "${key}".`)
      return id
    })

  // Directions.
  for (const entry of dataset.directions) {
    setExtensions('directions', entry.key, mergeExtensions(entry, directionFields))
    const current = executor
      .select()
      .from(careerDirections)
      .where(eq(careerDirections.key, entry.key))
      .get()
    if (!current) {
      createCareerDirection(executor, {
        key: entry.key,
        label: entry.label,
        targetTitles: entry.targetTitles,
        rules: (entry.rules ?? null) as GenerationRules | null,
        sortOrder: entry.sortOrder ?? 0,
      })
      addCount(report, 'directions', 'inserted')
    } else {
      const result = updateCareerDirection(executor, entry.key, {
        label: entry.label,
        targetTitles: entry.targetTitles,
        rules: (entry.rules ?? null) as GenerationRules | null,
        sortOrder: entry.sortOrder ?? 0,
      })
      let action: Action = result.changed ? 'updated' : 'unchanged'
      if (entry.retiredAt && current.retiredAt === null) {
        retireCareerDirection(executor, entry.key)
        action = 'updated'
      }
      addCount(report, 'directions', action)
    }
  }

  // Singletons. Both halves now share the one `career_profile` row, so their
  // pre-import existence is captured before either save for the report. Their
  // preserved fields share the row's single `extension_json` column, so the two
  // halves merge into one value (the preferences half wins a key collision).
  const candidateExisted = readCareerCandidate(executor) !== null
  const preferencesExisted = readCareerPreferences(executor) !== null
  const profileExtension: Record<string, unknown> = {}
  if (dataset.candidate) {
    Object.assign(profileExtension, mergeExtensions(dataset.candidate, candidateFields))
    const result = saveCareerCandidate(executor, dataset.candidate as CareerCandidateInput)
    addCount(
      report,
      'candidate',
      candidateExisted ? (result.changed ? 'updated' : 'unchanged') : 'inserted',
    )
  }
  if (dataset.preferences) {
    Object.assign(profileExtension, mergeExtensions(dataset.preferences, preferencesFields))
    const result = saveCareerPreferences(executor, dataset.preferences as CareerPreferencesInput)
    addCount(
      report,
      'preferences',
      preferencesExisted ? (result.changed ? 'updated' : 'unchanged') : 'inserted',
    )
  }
  setExtensions('candidate', singletonKey, profileExtension)

  // Education.
  const existingEducation = new Map(
    listCareerEducation(executor, { includeRetired: true }).map((row) => [row.stableKey, row]),
  )
  for (const entry of dataset.education) {
    setExtensions('education', entry.stableKey, mergeExtensions(entry, educationFields))
    const input = {
      stableKey: entry.stableKey,
      degree: entry.degree,
      school: entry.school,
      startDate: entry.startDate ?? null,
      endDate: entry.endDate ?? null,
      datePrecision: entry.datePrecision ?? ('day' as const),
      displayDates: entry.displayDates ?? null,
      year: entry.year ?? null,
      sortOrder: entry.sortOrder ?? 0,
      coursework: entry.coursework ?? [],
      details: entry.details ?? null,
    }
    const current = existingEducation.get(entry.stableKey)
    let id: number
    let action: Action
    if (!current) {
      id = createCareerEducation(executor, input).id
      action = 'inserted'
    } else {
      const result = updateCareerEducation(executor, current.id, input)
      id = current.id
      action = result.changed ? 'updated' : 'unchanged'
    }
    const retired = syncRetirement(
      current?.retiredAt ?? null,
      entry.retiredAt,
      () => retireCareerEducation(executor, id),
      () => restoreCareerEducation(executor, id),
    )
    if (retired && action !== 'inserted') action = 'updated'
    addCount(report, 'education', action)
  }

  // Experiences.
  const existingExperiences = new Map(
    listCareerExperiences(executor, { includeRetired: true }).map((row) => [row.stableKey, row]),
  )
  for (const entry of dataset.experiences) {
    const extensionValue = mergeExtensions(entry, experienceFields)
    const input = {
      stableKey: entry.stableKey,
      company: entry.company,
      role: entry.role,
      employmentNature: entry.employmentNature ?? null,
      startDate: entry.startDate ?? null,
      endDate: entry.endDate ?? null,
      datePrecision: entry.datePrecision ?? ('day' as const),
      displayDates: entry.displayDates ?? null,
      sortOrder: entry.sortOrder ?? 0,
      context: entry.context ?? null,
      responsibilities: entry.responsibilities ?? [],
      extension: Object.keys(extensionValue).length ? extensionValue : null,
    }
    const current = existingExperiences.get(entry.stableKey)
    let id: number
    let action: Action
    if (!current) {
      id = createCareerExperience(executor, input).id
      action = 'inserted'
    } else {
      const result = updateCareerExperience(executor, current.id, input)
      id = current.id
      action = result.changed ? 'updated' : 'unchanged'
    }
    const retired = syncRetirement(
      current?.retiredAt ?? null,
      entry.retiredAt,
      () => retireCareerExperience(executor, id),
      () => restoreCareerExperience(executor, id),
    )
    if (retired && action !== 'inserted') action = 'updated'
    addCount(report, 'experiences', action)
  }
  const experienceIdByKey = new Map(
    executor
      .select()
      .from(careerExperiences)
      .all()
      .map((row) => [row.stableKey, row.id]),
  )

  // Projects.
  const existingProjects = new Map(
    listCareerProjects(executor, { includeRetired: true }).map((row) => [row.stableKey, row]),
  )
  for (const entry of dataset.projects) {
    setExtensions('projects', entry.stableKey, mergeExtensions(entry, projectFields))
    const input = {
      stableKey: entry.stableKey,
      name: entry.name,
      experienceId: resolveId(experienceIdByKey, entry.experienceKey, 'Experience'),
      ownership: entry.ownership ?? null,
      eligibility: entry.eligibility ?? ('resume-eligible' as const),
      completion: entry.completion ?? null,
      urls: entry.urls ?? [],
      safeWording: entry.safeWording ?? null,
      limitations: entry.limitations ?? [],
      skills: skillIds(entry.skillKeys),
      directions: entry.directionKeys ?? [],
    }
    const current = existingProjects.get(entry.stableKey)
    let id: number
    let action: Action
    if (!current) {
      id = createCareerProject(executor, input).id
      action = 'inserted'
    } else {
      const result = updateCareerProject(executor, current.id, input)
      id = current.id
      action = result.changed ? 'updated' : 'unchanged'
    }
    const retired = syncRetirement(
      current?.retiredAt ?? null,
      entry.retiredAt,
      () => retireCareerProject(executor, id),
      () => restoreCareerProject(executor, id),
    )
    if (retired && action !== 'inserted') action = 'updated'
    addCount(report, 'projects', action)
  }
  const projectIdByKey = new Map(
    executor
      .select()
      .from(careerProjects)
      .all()
      .map((row) => [row.stableKey, row.id]),
  )

  // Publications.
  const existingPublications = new Map(
    listCareerPublications(executor, { includeRetired: true }).map((row) => [row.stableKey, row]),
  )
  for (const entry of dataset.publications) {
    setExtensions('publications', entry.stableKey, mergeExtensions(entry, publicationFields))
    const input = {
      stableKey: entry.stableKey,
      title: entry.title,
      citation: entry.citation,
      year: entry.year,
      status: entry.status,
      safeToUse: entry.safeToUse ?? true,
      experienceId: resolveId(experienceIdByKey, entry.experienceKey, 'Experience'),
      authors: entry.authors ?? [],
      authorListTruncated: entry.authorListTruncated ?? false,
      contributions: entry.contributions ?? [],
      sourceUrls: entry.sourceUrls ?? [],
      projectIds: (entry.projectKeys ?? []).map((key) =>
        resolveId(projectIdByKey, key, 'Project'),
      ) as number[],
      directions: entry.directionKeys ?? [],
    }
    const current = existingPublications.get(entry.stableKey)
    let id: number
    let action: Action
    if (!current) {
      id = createCareerPublication(executor, input).id
      action = 'inserted'
    } else {
      const result = updateCareerPublication(executor, current.id, input)
      id = current.id
      action = result.changed ? 'updated' : 'unchanged'
    }
    const retired = syncRetirement(
      current?.retiredAt ?? null,
      entry.retiredAt,
      () => retireCareerPublication(executor, id),
      () => restoreCareerPublication(executor, id),
    )
    if (retired && action !== 'inserted') action = 'updated'
    addCount(report, 'publications', action)
  }
  const publicationIdByKey = new Map(
    executor
      .select()
      .from(careerPublications)
      .all()
      .map((row) => [row.stableKey, row.id]),
  )

  // Achievements.
  const existingAchievements = new Map(
    listCareerAchievements(executor, { includeRetired: true }).map((row) => [row.stableKey, row]),
  )
  for (const entry of dataset.achievements) {
    setExtensions('achievements', entry.stableKey, mergeExtensions(entry, achievementFields))
    const input = {
      stableKey: entry.stableKey,
      experienceId: resolveId(experienceIdByKey, entry.experienceKey, 'Experience'),
      claim: entry.claim,
      safeToUse: entry.safeToUse ?? true,
      evidence: entry.evidence ?? [],
      evidenceNarratives: entry.evidenceNarratives ?? [],
      limitations: entry.limitations ?? [],
      skills: skillIds(entry.skillKeys),
      directions: entry.directionKeys ?? [],
      publicationIds: (entry.publicationKeys ?? []).map((key) =>
        resolveId(publicationIdByKey, key, 'Publication'),
      ) as number[],
    }
    const current = existingAchievements.get(entry.stableKey)
    let id: number
    let action: Action
    if (!current) {
      id = createCareerAchievement(executor, input).id
      action = 'inserted'
    } else {
      const result = updateCareerAchievement(executor, current.id, input)
      id = current.id
      action = result.changed ? 'updated' : 'unchanged'
    }
    const retired = syncRetirement(
      current?.retiredAt ?? null,
      entry.retiredAt,
      () => retireCareerAchievement(executor, id),
      () => restoreCareerAchievement(executor, id),
    )
    if (retired && action !== 'inserted') action = 'updated'
    addCount(report, 'achievements', action)
  }

  // Stories.
  const existingStories = new Map(
    listCareerStories(executor, { includeRetired: true }).map((row) => [row.stableKey, row]),
  )
  for (const entry of dataset.stories) {
    setExtensions('stories', entry.stableKey, mergeExtensions(entry, storyFields))
    const input = {
      stableKey: entry.stableKey,
      experienceId: resolveId(experienceIdByKey, entry.experienceKey, 'Experience'),
      title: entry.title,
      context: entry.context ?? null,
      situation: entry.situation ?? null,
      task: entry.task ?? null,
      action: entry.action ?? null,
      result: entry.result ?? null,
      narrative: entry.narrative ?? null,
      directions: entry.directionKeys ?? [],
    }
    const current = existingStories.get(entry.stableKey)
    let id: number
    let action: Action
    if (!current) {
      id = createCareerStory(executor, input).id
      action = 'inserted'
    } else {
      const result = updateCareerStory(executor, current.id, input)
      id = current.id
      action = result.changed ? 'updated' : 'unchanged'
    }
    const retired = syncRetirement(
      current?.retiredAt ?? null,
      entry.retiredAt,
      () => retireCareerStory(executor, id),
      () => restoreCareerStory(executor, id),
    )
    if (retired && action !== 'inserted') action = 'updated'
    addCount(report, 'stories', action)
  }

  // Personal skills.
  const existingPersonalSkills = new Map(
    listCareerSkills(executor, { includeRetired: true }).map((row) => [row.skillKey, row]),
  )
  for (const entry of dataset.personalSkills) {
    setExtensions('personalSkills', entry.skillKey, mergeExtensions(entry, personalSkillFields))
    const skillId = skillIds([entry.skillKey])[0]
    const input = {
      level: entry.level ?? null,
      resumeEligible: entry.resumeEligible ?? true,
      explanation: entry.explanation ?? null,
      notes: entry.notes ?? null,
      evidence: entry.evidence ?? [],
    }
    const current = existingPersonalSkills.get(entry.skillKey)
    let id: number
    let action: Action
    if (!current) {
      id = createCareerSkill(executor, { skillId, ...input }).id
      action = 'inserted'
    } else {
      const result = updateCareerSkill(executor, current.id, input)
      id = current.id
      action = result.changed ? 'updated' : 'unchanged'
    }
    if (!current && entry.retiredAt) {
      retireCareerSkill(executor, id)
      action = 'inserted'
    }
    addCount(report, 'personalSkills', action)
  }

  // Base Resumes.
  for (const entry of dataset.baseResumes) {
    setExtensions(
      'baseResumes',
      `${entry.directionKey}#${entry.version}`,
      mergeExtensions(entry, baseResumeFields),
    )
    const versions = listBaseResumeVersions(executor, entry.directionKey)
    const existing = versions.find((row) => row.version === entry.version)
    let id: number
    let inserted = false
    if (!existing) {
      id = createBaseResumeDraft(executor, {
        directionKey: entry.directionKey,
        version: entry.version,
        markdown: entry.markdown,
      }).id
      inserted = true
    } else {
      id = existing.id
    }
    if (entry.status === 'approved') {
      const result = approveBaseResumeVersion(executor, id, {
        approvedAt: entry.approvedAt ?? todayISO(),
      })
      addCount(
        report,
        'baseResumes',
        inserted ? 'inserted' : result.changed ? 'updated' : 'unchanged',
      )
    } else if (entry.status === 'superseded') {
      const result = supersedeBaseResumeVersion(executor, id)
      addCount(
        report,
        'baseResumes',
        inserted ? 'inserted' : result.changed ? 'updated' : 'unchanged',
      )
    } else {
      addCount(report, 'baseResumes', inserted ? 'inserted' : 'unchanged')
    }
  }

  // Preserved authored fields land in the row that owns them. Every row now
  // exists, so each write addresses a real row; kinds without an extension
  // column report no change. A never-written extension stays NULL.
  let extensionsChanged = false
  for (const [kind, entries] of Object.entries(extensions)) {
    for (const key of Object.keys(entries)) {
      const value = entries[key] as Record<string, unknown> | undefined
      if (writeRecordExtensions(executor, kind, key, value ?? null)) {
        extensionsChanged = true
      }
    }
  }
  addCount(report, 'extensions', extensionsChanged ? 'updated' : 'unchanged')

  // Document roots ride on the profile singleton. There is no row to write to
  // when a dataset carries neither a candidate nor preferences.
  const documentsChanged = writeCareerDocuments(executor, dataset.documents ?? {})
  addCount(report, 'documents', documentsChanged ? 'updated' : 'unchanged')

  return report
}

/**
 * Persists the per-source-document roots on the `career_profile` singleton,
 * returning `true` only for a real change. A legacy dataset's `state` archive is
 * deliberately ignored: every fact it carried now lives in the tables.
 */
function writeCareerDocuments(executor: CareerDb, documents: Record<string, unknown>): boolean {
  const profile = executor
    .select({ documentsJson: careerProfile.documentsJson })
    .from(careerProfile)
    .where(eq(careerProfile.id, 1))
    .get()
  if (!profile) return false
  const next = Object.keys(documents).length > 0 ? documents : null
  const current = parseDocuments(profile.documentsJson)
  if (stableFingerprint(current) === stableFingerprint(next)) return false
  return (
    executor
      .update(careerProfile)
      .set({
        documentsJson: next === null ? null : serializeJsonColumn(next),
        updatedAt: nowISO(),
      })
      .where(eq(careerProfile.id, 1))
      .returning({ id: careerProfile.id })
      .all().length > 0
  )
}

function parseDocuments(value: string | null): Record<string, unknown> | null {
  if (value === null || value.trim() === '') return null
  return asRecord(parseJsonColumn(value, documentsSchema, {}, 'career_profile.documents_json'))
}

// ---------------------------------------------------------------------------
// Preview and apply
// ---------------------------------------------------------------------------

const ROLLBACK = Symbol('career-import-dry-run')

function dryRun(
  executor: CareerDb,
  dataset: CareerDataset,
): { report: CareerImportReport | null; error: unknown } {
  let report: CareerImportReport | null = null
  let error: unknown = null
  try {
    executor.transaction((tx) => {
      report = applyCareerDataset(tx, dataset)
      throw ROLLBACK
    })
  } catch (caught) {
    if (caught !== ROLLBACK) error = caught
  }
  return { report, error }
}

export function prepareCareerImport(
  executor: CareerDb,
  source: CareerImportSource,
): CareerImportPreview {
  const { dataset, sourceHash } = readSource(source)
  const databaseRevision = careerContentProbe(executor)
  const conflicts = validateCareerImport(executor, dataset)
  let report = emptyReport()
  if (conflicts.length === 0) {
    const outcome = dryRun(executor, dataset)
    if (outcome.error) {
      conflicts.push(
        `Import would fail while applying: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`,
      )
    } else if (outcome.report) {
      report = outcome.report
    }
  }
  return {
    sourceHash,
    databaseRevision,
    report,
    conflicts: dedupeConflicts(conflicts),
    dataset,
    source,
  }
}

export function applyCareerImport(
  executor: CareerDb,
  preview: CareerImportPreview,
): CareerImportReport {
  if (preview.conflicts.length > 0) throw new CareerImportConflictError(preview.conflicts)
  if (careerSourceHash(preview.source) !== preview.sourceHash) {
    throw new CareerImportStaleError(
      'The import source changed since the preview was prepared; run a new dry run.',
    )
  }
  if (careerContentProbe(executor) !== preview.databaseRevision) {
    throw new CareerImportStaleError(
      'The career database changed since the preview was prepared; run a new dry run.',
    )
  }
  return executor.transaction((tx) => {
    if (careerContentProbe(tx) !== preview.databaseRevision) {
      throw new CareerImportStaleError(
        'The career database changed while applying the import; run a new dry run.',
      )
    }
    return applyCareerDataset(tx, preview.dataset)
  })
}
