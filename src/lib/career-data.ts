import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

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
        safeToUse: z.boolean(),
        evidence: z.array(z.string()),
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
      .object({ id: idSchema, label: z.string().min(1), directions: referenceIdsSchema })
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
  projects: z.infer<typeof projectsSchema>
  skills: z.infer<typeof skillsSchema>
  stories: z.infer<typeof storiesSchema>
  preferences: z.infer<typeof preferencesSchema>
  portfolio: z.infer<typeof portfolioSchema>
  profiles: z.infer<typeof careerProfileSchema>[]
}

function directory(name: 'career-data' | 'profiles') {
  const paths = [resolve(process.cwd(), name), resolve(process.cwd(), '..', name)]
  const path = paths.find(existsSync)
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
    'projects',
    data.projects.projects.map((item) => item.id),
  )
  assertUnique(
    'skills',
    data.skills.skills.map((item) => item.id),
  )
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
