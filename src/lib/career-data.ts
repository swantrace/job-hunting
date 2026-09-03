import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { normalizeSkillAlias } from './skills/normalize'
import { hasSkillCategory } from './skills/taxonomy'

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
      z.object({ id: idSchema, degree: z.string().min(1), school: z.string().min(1) }),
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
      category: z
        .string()
        .trim()
        .min(1)
        .refine(hasSkillCategory, 'Choose a category from career-data/skill-taxonomy.json.'),
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

function directory() {
  const configuredPath = process.env.CAREER_DATA_DIR?.trim()
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

export function validateCareerData(data: CanonicalCareerData) {
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
    if (!hasSkillCategory(skill.category))
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

let careerDataCache: { signature: string; data: CanonicalCareerData } | null = null

function careerDataSignature(dir: string): string {
  return careerDataFiles
    .map((file) => {
      const filePath = resolve(dir, file)
      if (!existsSync(filePath)) return ''
      try {
        return statSync(filePath).mtimeMs
      } catch {
        return ''
      }
    })
    .join('|')
}

function readCareerData(dir: string): CanonicalCareerData {
  const parsed: CanonicalCareerData = {
    candidate: candidateSchema.parse(readJson(resolve(dir, 'candidate.json'))),
    experiences: experiencesSchema.parse(readJson(resolve(dir, 'experiences.json'))),
    achievements: achievementsSchema.parse(readJson(resolve(dir, 'achievements.json'))),
    publications: publicationsSchema.parse(
      existsSync(resolve(dir, 'publications.json'))
        ? readJson(resolve(dir, 'publications.json'))
        : { schemaVersion: 1, lastUpdated: '1970-01-01', publications: [] },
    ),
    projects: projectsSchema.parse(readJson(resolve(dir, 'projects.json'))),
    skills: skillsSchema.parse(readJson(resolve(dir, 'skills.json'))),
    stories: storiesSchema.parse(readJson(resolve(dir, 'stories.json'))),
    preferences: preferencesSchema.parse(readJson(resolve(dir, 'preferences.json'))),
    portfolio: portfolioSchema.parse(readJson(resolve(dir, 'portfolio-content.json'))),
  }
  return validateCareerData(parsed)
}

/**
 * Reads, parses, and validates the canonical career data once, then caches the
 * result until any source file's mtime changes. `loadCareerData` is called many
 * times per request (availability, review data, readiness, evidence) and the
 * parse + cross-reference validation is the dominant synchronous cost of the
 * workspace route, so the cache keeps repeated loads cheap.
 */
export function loadCareerData(): CanonicalCareerData {
  const dir = directory()
  const signature = careerDataSignature(dir)
  if (careerDataCache && careerDataCache.signature === signature) return careerDataCache.data
  const data = readCareerData(dir)
  careerDataCache = { signature, data }
  return data
}

export function careerSkillEvidenceMap(): Record<string, string[]> {
  try {
    const data = loadCareerData()
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
 * Reusable catalog of canonical source IDs. Achievements and publications are
 * included only when safeToUse; every other catalog is included in full so the
 * candidate-fit service can reject references to unsafe or ineligible sources.
 */
export function careerEvidenceIds(data: CanonicalCareerData) {
  return {
    experience: new Set(data.experiences.experiences.map((item) => item.id)),
    achievement: new Set(
      data.achievements.achievements.filter((item) => item.safeToUse).map((item) => item.id),
    ),
    project: new Set(data.projects.projects.map((item) => item.id)),
    publication: new Set(
      data.publications.publications.filter((item) => item.safeToUse).map((item) => item.id),
    ),
    skill: new Set(data.skills.skills.map((item) => item.id)),
    story: new Set(data.stories.stories.map((item) => item.id)),
  }
}
