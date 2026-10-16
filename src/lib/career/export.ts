import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { listBaseResumeVersions } from '../../db/career-base-resumes'
import { listCareerDirections } from '../../db/career-directions'
import { readCareerCandidate, readCareerPreferences } from '../../db/career-facts'
import {
  listCareerAchievements,
  listCareerEducation,
  listCareerExperiences,
  listCareerProjects,
  listCareerPublications,
  listCareerStories,
} from '../../db/career-records'
import { listCareerSkills } from '../../db/career-skills'
import { careerProfile, skillAliases, skillCategories, skills } from '../../db/schema'
import type { DbExecutor } from '../../db/skill-queries'
import { nowISO } from '../date'
import {
  type CareerDataset,
  type CareerDatasetBaseResume,
  type CareerDatasetScope,
  careerDatasetExcluded,
  careerDatasetFormat,
  careerDatasetSchemaVersion,
} from './dataset'
import { extensionSchema, parseJsonColumn } from './json-schemas'

/**
 * Builds the portable, versioned `career-dataset` from SQLite.
 *
 * The export is deliberately logical: it carries editorial career facts and
 * their stable keys, never internal row ids, OAuth credentials, application or
 * analysis history, generation runs, document reviews or artifact file contents.
 * A full operational recovery needs a consistent SQLite backup, which the
 * dataset's `excluded` note tells the operator explicitly.
 */

export type CareerExportOptions = { scope?: 'full' | { directionKey: string } | CareerDatasetScope }

function resolveScope(options: CareerExportOptions): CareerDatasetScope {
  const scope = options.scope ?? 'full'
  if (scope === 'full') return { kind: 'full' }
  if ('kind' in scope) return scope
  return { kind: 'direction', directionKey: scope.directionKey }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nonEmpty(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value)
  return Object.keys(record).length > 0 ? record : undefined
}

/** One row's preserved authored fields, read from its `extension_json` column. */
function rowExtensions(value: string | null | undefined): Record<string, unknown> | undefined {
  if (value === null || value === undefined || value.trim() === '') return undefined
  return nonEmpty(parseJsonColumn(value, extensionSchema, {}, 'extension_json'))
}

type DirectionalRecord = {
  id: number
  stableKey: string
  experienceId?: number | null
  projectIds?: number[]
  publicationIds?: number[]
  directions?: string[]
  skills?: number[]
}

/**
 * Direction scope keeps the candidate-level facts, the selected direction and
 * every record linked to it, then closes over the records those records
 * reference so nothing dangles when the dataset is imported again.
 */
function selectDirectionalRecordKeys(
  directionKey: string,
  records: {
    experiences: Array<{ id: number; stableKey: string }>
    projects: DirectionalRecord[]
    publications: DirectionalRecord[]
    achievements: DirectionalRecord[]
    stories: DirectionalRecord[]
  },
) {
  const experienceKeyById = new Map(records.experiences.map((row) => [row.id, row.stableKey]))
  const projectKeyById = new Map(records.projects.map((row) => [row.id, row.stableKey]))
  const publicationKeyById = new Map(records.publications.map((row) => [row.id, row.stableKey]))
  const projectByKey = new Map(records.projects.map((row) => [row.stableKey, row]))
  const publicationByKey = new Map(records.publications.map((row) => [row.stableKey, row]))

  const experienceKeys = new Set<string>()
  const projectKeys = new Set<string>()
  const publicationKeys = new Set<string>()
  const achievementKeys = new Set<string>()
  const storyKeys = new Set<string>()

  const addExperience = (id: number | null | undefined) => {
    const key = id === null || id === undefined ? undefined : experienceKeyById.get(id)
    if (key) experienceKeys.add(key)
  }
  const addProject = (key: string | null | undefined) => {
    if (!key || projectKeys.has(key)) return
    projectKeys.add(key)
    addExperience(projectByKey.get(key)?.experienceId)
  }
  const addPublication = (key: string | null | undefined) => {
    if (!key || publicationKeys.has(key)) return
    publicationKeys.add(key)
    const publication = publicationByKey.get(key)
    addExperience(publication?.experienceId)
    for (const projectId of publication?.projectIds ?? []) addProject(projectKeyById.get(projectId))
  }

  for (const record of records.projects)
    if (record.directions?.includes(directionKey)) addProject(record.stableKey)
  for (const record of records.publications)
    if (record.directions?.includes(directionKey)) addPublication(record.stableKey)
  for (const record of records.achievements) {
    if (!record.directions?.includes(directionKey)) continue
    achievementKeys.add(record.stableKey)
    addExperience(record.experienceId)
    for (const publicationId of record.publicationIds ?? [])
      addPublication(publicationKeyById.get(publicationId))
  }
  for (const record of records.stories) {
    if (!record.directions?.includes(directionKey)) continue
    storyKeys.add(record.stableKey)
    addExperience(record.experienceId)
  }
  return { experienceKeys, projectKeys, publicationKeys, achievementKeys, storyKeys }
}

export function buildCareerDataset(
  executor: DbExecutor,
  options: CareerExportOptions = {},
): CareerDataset {
  const scope = resolveScope(options)
  const directionKey = scope.kind === 'direction' ? scope.directionKey : null

  const categories = executor
    .select()
    .from(skillCategories)
    .orderBy(asc(skillCategories.sortOrder), asc(skillCategories.key))
    .all()
    .map((row) => ({
      key: row.key,
      label: row.label,
      sortOrder: row.sortOrder,
    }))

  const skillRows = executor.select().from(skills).orderBy(asc(skills.key)).all()
  const skillKeyById = new Map(skillRows.map((row) => [row.id, row.key]))
  const aliasesBySkill = new Map<number, string[]>()
  for (const alias of executor.select().from(skillAliases).orderBy(asc(skillAliases.id)).all()) {
    const list = aliasesBySkill.get(alias.skillId) ?? []
    list.push(alias.alias)
    aliasesBySkill.set(alias.skillId, list)
  }
  const catalog = skillRows.map((row) => ({
    key: row.key,
    name: row.name,
    category: row.category,
    reviewStatus: row.reviewStatus,
    origin: row.origin,
    aliases: aliasesBySkill.get(row.id) ?? [],
    mergedIntoKey: row.mergedIntoSkillId ? (skillKeyById.get(row.mergedIntoSkillId) ?? null) : null,
  }))

  const candidate = readCareerCandidate(executor)
  const preferences = readCareerPreferences(executor)
  // The profile singleton owns both halves' preserved fields (0029 merged them
  // into one column) and the per-source-document root values.
  const profileRow = executor
    .select({
      extensionJson: careerProfile.extensionJson,
      documentsJson: careerProfile.documentsJson,
    })
    .from(careerProfile)
    .where(eq(careerProfile.id, 1))
    .get()
  const profileExtensions = rowExtensions(profileRow?.extensionJson ?? null) ?? {}
  const documents = asRecord(
    parseJsonColumn(
      profileRow?.documentsJson ?? null,
      z.record(z.string(), z.unknown()),
      {},
      'career_profile.documents_json',
    ),
  )

  const allEducation = listCareerEducation(executor, { includeRetired: true })
  const allExperiences = listCareerExperiences(executor, { includeRetired: true })
  const allProjects = listCareerProjects(executor, { includeRetired: true })
  const allPublications = listCareerPublications(executor, { includeRetired: true })
  const allAchievements = listCareerAchievements(executor, { includeRetired: true })
  const allStories = listCareerStories(executor, { includeRetired: true })

  const selected =
    directionKey === null
      ? null
      : selectDirectionalRecordKeys(directionKey, {
          experiences: allExperiences.map((row) => ({ id: row.id, stableKey: row.stableKey })),
          projects: allProjects,
          publications: allPublications,
          achievements: allAchievements,
          stories: allStories,
        })
  const keep = (keys: Set<string> | undefined, stableKey: string) =>
    keys === undefined || keys.has(stableKey)

  const education = allEducation.map((row) => ({
    stableKey: row.stableKey,
    degree: row.degree,
    school: row.school,
    startDate: row.startDate,
    endDate: row.endDate,
    datePrecision: row.datePrecision as 'day' | 'month' | 'year',
    displayDates: row.displayDates,
    year: row.year,
    sortOrder: row.sortOrder,
    coursework: row.coursework,
    details: row.details,
    retiredAt: row.retiredAt,
    extensions: rowExtensions(row.extensionJson),
  }))

  const experiences = allExperiences
    .filter((row) => keep(selected?.experienceKeys, row.stableKey))
    .map((row) => ({
      stableKey: row.stableKey,
      company: row.company,
      role: row.role,
      employmentNature: row.employmentNature,
      startDate: row.startDate,
      endDate: row.endDate,
      datePrecision: row.datePrecision as 'day' | 'month' | 'year',
      displayDates: row.displayDates,
      sortOrder: row.sortOrder,
      context: row.context,
      responsibilities: row.responsibilities,
      retiredAt: row.retiredAt,
      extensions: nonEmpty(row.extension),
    }))

  const projectKeyById = new Map(allProjects.map((row) => [row.id, row.stableKey]))
  const publicationKeyById = new Map(allPublications.map((row) => [row.id, row.stableKey]))
  const projectKey = (id: number) => projectKeyById.get(id)
  const publicationKey = (id: number) => publicationKeyById.get(id)
  const skillKey = (id: number) => skillKeyById.get(id)

  const projects = allProjects
    .filter((row) => keep(selected?.projectKeys, row.stableKey))
    .map((row) => ({
      stableKey: row.stableKey,
      name: row.name,
      experienceKey: row.experienceId
        ? (allExperiences.find((item) => item.id === row.experienceId)?.stableKey ?? null)
        : null,
      ownership: row.ownership,
      eligibility: row.eligibility as 'resume-eligible' | 'not-eligible',
      completion: row.completion,
      urls: row.urls,
      safeWording: row.safeWording,
      limitations: row.limitations,
      skillKeys: row.skills.map(skillKey).filter((key): key is string => Boolean(key)),
      directionKeys: row.directions,
      retiredAt: row.retiredAt,
      extensions: rowExtensions(row.extensionJson),
    }))

  const publications = allPublications
    .filter((row) => keep(selected?.publicationKeys, row.stableKey))
    .map((row) => ({
      stableKey: row.stableKey,
      title: row.title,
      citation: row.citation,
      year: row.year,
      status: row.status as 'published' | 'in-review' | 'preprint' | 'needs-verification',
      safeToUse: row.safeToUse,
      experienceKey: row.experienceId
        ? (allExperiences.find((item) => item.id === row.experienceId)?.stableKey ?? null)
        : null,
      authors: row.authors,
      authorListTruncated: row.authorListTruncated,
      contributions: row.contributions,
      sourceUrls: row.sourceUrls,
      projectKeys: row.projectIds.map(projectKey).filter((key): key is string => Boolean(key)),
      directionKeys: row.directions,
      retiredAt: row.retiredAt,
      extensions: rowExtensions(row.extensionJson),
    }))

  const achievements = allAchievements
    .filter((row) => keep(selected?.achievementKeys, row.stableKey))
    .map((row) => ({
      stableKey: row.stableKey,
      experienceKey: row.experienceId
        ? (allExperiences.find((item) => item.id === row.experienceId)?.stableKey ?? null)
        : null,
      claim: row.claim,
      safeToUse: row.safeToUse,
      evidence: row.evidence,
      evidenceNarratives: row.evidenceNarratives,
      limitations: row.limitations,
      skillKeys: row.skills.map(skillKey).filter((key): key is string => Boolean(key)),
      directionKeys: row.directions,
      publicationKeys: row.publicationIds
        .map(publicationKey)
        .filter((key): key is string => Boolean(key)),
      retiredAt: row.retiredAt,
      extensions: rowExtensions(row.extensionJson),
    }))

  const stories = allStories
    .filter((row) => keep(selected?.storyKeys, row.stableKey))
    .map((row) => ({
      stableKey: row.stableKey,
      experienceKey: row.experienceId
        ? (allExperiences.find((item) => item.id === row.experienceId)?.stableKey ?? null)
        : null,
      title: row.title,
      context: row.context,
      situation: row.situation,
      task: row.task,
      action: row.action,
      result: row.result,
      narrative: row.narrative,
      directionKeys: row.directions,
      retiredAt: row.retiredAt,
      extensions: rowExtensions(row.extensionJson),
    }))

  const personalSkills = listCareerSkills(executor, { includeRetired: true }).map((row) => ({
    skillKey: row.skillKey,
    level: row.level,
    resumeEligible: row.resumeEligible,
    explanation: row.explanation,
    notes: row.notes,
    evidence: row.evidence,
    retiredAt: row.retiredAt,
    extensions: nonEmpty(row.extension),
  }))

  const directions = listCareerDirections(executor, { includeRetired: true })
    .filter((row) => directionKey === null || row.key === directionKey)
    .map((row) => ({
      key: row.key,
      label: row.label,
      targetTitles: row.targetTitles,
      rules: row.rules,
      sortOrder: row.sortOrder,
      retiredAt: row.retiredAt,
    }))

  const baseResumes: CareerDatasetBaseResume[] = directions.flatMap((direction) =>
    listBaseResumeVersions(executor, direction.key).map((row) => ({
      directionKey: row.directionKey,
      version: row.version,
      status: row.status as 'draft' | 'approved' | 'superseded',
      markdown: row.markdown,
      contentHash: row.contentHash,
      approvedAt: row.approvedAt,
      ...rowExtensions(row.extensionJson),
    })),
  )

  return {
    format: careerDatasetFormat,
    schemaVersion: careerDatasetSchemaVersion,
    exportedAt: nowISO(),
    scope,
    categories,
    catalog,
    candidate: candidate
      ? {
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          location: candidate.location,
          website: candidate.website,
          linkedinUrl: candidate.linkedinUrl,
          githubUrl: candidate.githubUrl,
          authorization: candidate.authorization,
          careerBreak: candidate.careerBreak,
          truthfulness: candidate.truthfulness,
          ...profileExtensions,
        }
      : null,
    preferences: preferences
      ? {
          locations: preferences.locations,
          workModes: preferences.workModes,
          availability: preferences.availability,
          compensation: preferences.compensation,
          notes: preferences.notes,
          ...profileExtensions,
        }
      : null,
    education,
    experiences,
    achievements,
    projects,
    stories,
    publications,
    personalSkills,
    directions,
    baseResumes,
    documents,
    excluded: {
      kinds: [...careerDatasetExcluded.kinds],
      reason: careerDatasetExcluded.reason,
    },
  }
}

export function serializeCareerDataset(dataset: CareerDataset): string {
  return `${JSON.stringify(dataset, null, 2)}\n`
}
