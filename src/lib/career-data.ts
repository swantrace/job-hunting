import { existsSync, readFileSync } from 'node:fs'
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
    identity: z.object({ fullName: z.string().min(1), email: z.string().email() }).passthrough(),
    education: z.array(
      z.object({ id: idSchema, degree: z.string().min(1), school: z.string().min(1) }),
    ),
  })
  .passthrough()
const experiencesSchema = documentSchema.extend({
  experiences: z.array(
    z.object({ id: idSchema, company: z.string().min(1), role: z.string().min(1) }).passthrough(),
  ),
})
const achievementsSchema = documentSchema.extend({
  achievements: z.array(
    z
      .object({
        id: idSchema,
        experienceId: idSchema.nullable(),
        skills: referenceIdsSchema,
        directions: referenceIdsSchema,
        publicationIds: referenceIdsSchema.optional(),
        safeToUse: z.boolean(),
        evidence: z.array(z.string()),
      })
      .passthrough(),
  ),
})
const publicationsSchema = documentSchema.extend({
  publications: z.array(
    z
      .object({
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
      })
      .passthrough(),
  ),
})
const projectsSchema = documentSchema.extend({
  projects: z.array(
    z
      .object({
        id: idSchema,
        name: z.string().min(1),
        skills: referenceIdsSchema,
        directions: referenceIdsSchema,
      })
      .passthrough(),
  ),
})
const skillsSchema = documentSchema.extend({
  skills: z.array(
    z
      .object({
        id: idSchema,
        label: z.string().min(1),
        category: z
          .string()
          .trim()
          .min(1)
          .refine(hasSkillCategory, 'Choose a category from config/skill-taxonomy.json.'),
        aliases: z.array(z.string().trim().min(1).max(120)).default([]),
        directions: referenceIdsSchema,
      })
      .passthrough(),
  ),
})
const storiesSchema = documentSchema.extend({
  stories: z.array(
    z
      .object({ id: idSchema, experienceId: idSchema.nullable(), directions: referenceIdsSchema })
      .passthrough(),
  ),
})
const preferencesSchema = documentSchema
  .extend({
    directionDefinitions: z.record(
      idSchema,
      z.object({ label: z.string().min(1), targetTitles: z.array(z.string().min(1)).min(1) }),
    ),
  })
  .passthrough()
const portfolioSchema = documentSchema
  .extend({
    topics: z.array(
      z
        .object({ id: idSchema, projects: referenceIdsSchema, directions: referenceIdsSchema })
        .passthrough(),
    ),
  })
  .passthrough()

export const careerProfileSchema = documentSchema
  .extend({
    id: idSchema,
    label: z.string().min(1),
    targetTitles: z.array(z.string().min(1)).min(1),
    preferredSkillIds: referenceIdsSchema,
    conditionalSkillIds: referenceIdsSchema,
    excludeUntilUpgraded: referenceIdsSchema,
    preferredAchievementIds: referenceIdsSchema,
    preferredProjectIds: referenceIdsSchema,
    preferredPublicationIds: referenceIdsSchema.default([]),
    experienceSelection: z.object({
      requiredIds: referenceIdsSchema,
      priorityOrder: referenceIdsSchema,
      maxBulletsByExperience: z.record(idSchema, z.number().int().min(0).max(10)),
    }),
    coverLetterStrategy: z.object({ preferredStoryIds: referenceIdsSchema }).passthrough(),
  })
  .passthrough()

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
  profiles: z.infer<typeof careerProfileSchema>[]
}

function directory(name: 'career-data' | 'profiles') {
  const exampleName = `${name}.example`
  const configuredPath =
    process.env[name === 'career-data' ? 'CAREER_DATA_DIR' : 'CAREER_PROFILES_DIR']?.trim()
  const paths = [
    configuredPath,
    resolve(process.cwd(), name),
    resolve(process.cwd(), '..', name),
    resolve(process.cwd(), exampleName),
    resolve(process.cwd(), '..', exampleName),
  ]
  const path = paths.filter((candidate): candidate is string => Boolean(candidate)).find(existsSync)
  if (!path) throw new Error(`${name} directory was not found.`)
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
  assertUnique(
    'profiles',
    data.profiles.map((profile) => profile.id),
  )
  for (const profile of data.profiles) {
    if (!directionIds.has(profile.id))
      throw new Error(`Profile "${profile.id}" has no preference direction definition.`)
    assertReferences(
      `profile ${profile.id} skills`,
      [
        ...profile.preferredSkillIds,
        ...profile.conditionalSkillIds,
        ...profile.excludeUntilUpgraded,
      ],
      skillIds,
    )
    assertReferences(
      `profile ${profile.id} achievements`,
      profile.preferredAchievementIds,
      achievementIds,
    )
    assertReferences(`profile ${profile.id} projects`, profile.preferredProjectIds, projectIds)
    assertReferences(
      `profile ${profile.id} publications`,
      profile.preferredPublicationIds,
      publicationIds,
    )
    assertReferences(
      `profile ${profile.id} experiences`,
      [
        ...profile.experienceSelection.requiredIds,
        ...profile.experienceSelection.priorityOrder,
        ...Object.keys(profile.experienceSelection.maxBulletsByExperience),
      ],
      experienceIds,
    )
    assertReferences(
      `profile ${profile.id} stories`,
      profile.coverLetterStrategy.preferredStoryIds,
      storyIds,
    )
  }
  return data
}

export function loadCareerData(): CanonicalCareerData {
  const careerData = directory('career-data')
  const profiles = directory('profiles')
  const parsed: CanonicalCareerData = {
    candidate: candidateSchema.parse(readJson(resolve(careerData, 'candidate.json'))),
    experiences: experiencesSchema.parse(readJson(resolve(careerData, 'experiences.json'))),
    achievements: achievementsSchema.parse(readJson(resolve(careerData, 'achievements.json'))),
    publications: publicationsSchema.parse(
      existsSync(resolve(careerData, 'publications.json'))
        ? readJson(resolve(careerData, 'publications.json'))
        : { schemaVersion: 1, lastUpdated: '1970-01-01', publications: [] },
    ),
    projects: projectsSchema.parse(readJson(resolve(careerData, 'projects.json'))),
    skills: skillsSchema.parse(readJson(resolve(careerData, 'skills.json'))),
    stories: storiesSchema.parse(readJson(resolve(careerData, 'stories.json'))),
    preferences: preferencesSchema.parse(readJson(resolve(careerData, 'preferences.json'))),
    portfolio: portfolioSchema.parse(readJson(resolve(careerData, 'portfolio-content.json'))),
    profiles: ['fullstack', 'frontend', 'fhir'].map((id) => {
      const profile = careerProfileSchema.parse(readJson(resolve(profiles, `${id}.profile.json`)))
      if (profile.id !== id)
        throw new Error(`Profile ID "${profile.id}" must match filename "${id}".`)
      return profile
    }),
  }
  return validateCareerData(parsed)
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
