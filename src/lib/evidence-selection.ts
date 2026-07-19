import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { type GenerationSource, saveGenerationEvidenceSnapshot } from '../db/generation'
import { getArtifactsRoot } from './artifact-storage'
import { loadCareerData } from './career-data'
import { todayISO } from './date'

export const evidenceSelectionSnapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generationRunId: z.number().int().positive(),
  application: z.object({
    id: z.number().int().positive(),
    direction: z.string(),
    jobTitle: z.string(),
  }),
  sourceVersions: z.object({
    candidate: z.number().int(),
    experiences: z.number().int(),
    achievements: z.number().int(),
    projects: z.number().int(),
    skills: z.number().int(),
    stories: z.number().int(),
    profile: z.number().int(),
  }),
  profile: z.object({ id: z.string(), lastUpdated: z.string() }),
  selection: z.object({
    experienceIds: z.array(z.string()),
    achievementIds: z.array(z.string()),
    projectIds: z.array(z.string()),
    preferredSkillIds: z.array(z.string()),
    matchedConditionalSkillIds: z.array(z.string()),
    storyIds: z.array(z.string()),
    excludedUnsafeAchievementIds: z.array(z.string()),
  }),
  facts: z.object({
    candidate: z.unknown(),
    experiences: z.array(z.unknown()),
    achievements: z.array(z.unknown()),
    projects: z.array(z.unknown()),
    skills: z.array(z.unknown()),
    stories: z.array(z.unknown()),
  }),
})

export type EvidenceSelectionSnapshot = z.infer<typeof evidenceSelectionSnapshotSchema>

const normalise = (value: string) =>
  value.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')

export function buildEvidenceSelectionSnapshot(
  source: GenerationSource,
): EvidenceSelectionSnapshot {
  const data = loadCareerData()
  const profile = data.profiles.find((item) => item.id === source.application.direction)
  if (!profile)
    throw new Error(`No canonical profile exists for direction "${source.application.direction}".`)
  const jobTerms = new Set([
    ...source.skills.map(normalise),
    ...(source.analysis?.requirements ?? '').split('\n').map(normalise),
  ])
  const experiences = profile.experienceSelection.priorityOrder
    .map((id) => data.experiences.experiences.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const preferredAchievements = profile.preferredAchievementIds
    .map((id) => data.achievements.achievements.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const achievements = preferredAchievements.filter((item) => item.safeToUse)
  const projects = profile.preferredProjectIds
    .map((id) => data.projects.projects.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const preferredSkills = profile.preferredSkillIds
    .map((id) => data.skills.skills.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const conditionalSkills = profile.conditionalSkillIds.filter((id) => jobTerms.has(normalise(id)))
  const matchedConditionalSkills = conditionalSkills
    .map((id) => data.skills.skills.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const stories = profile.coverLetterStrategy.preferredStoryIds
    .map((id) => data.stories.stories.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)

  return evidenceSelectionSnapshotSchema.parse({
    version: 1,
    generatedAt: todayISO(),
    generationRunId: source.run.id,
    application: {
      id: source.application.id,
      direction: source.application.direction,
      jobTitle: source.application.jobTitle,
    },
    sourceVersions: {
      candidate: data.candidate.schemaVersion,
      experiences: data.experiences.schemaVersion,
      achievements: data.achievements.schemaVersion,
      projects: data.projects.schemaVersion,
      skills: data.skills.schemaVersion,
      stories: data.stories.schemaVersion,
      profile: profile.schemaVersion,
    },
    profile: { id: profile.id, lastUpdated: profile.lastUpdated },
    selection: {
      experienceIds: experiences.map((item) => item.id),
      achievementIds: achievements.map((item) => item.id),
      projectIds: projects.map((item) => item.id),
      preferredSkillIds: preferredSkills.map((item) => item.id),
      matchedConditionalSkillIds: matchedConditionalSkills.map((item) => item.id),
      storyIds: stories.map((item) => item.id),
      excludedUnsafeAchievementIds: preferredAchievements
        .filter((item) => !item.safeToUse)
        .map((item) => item.id),
    },
    facts: {
      candidate: data.candidate,
      experiences,
      achievements,
      projects,
      skills: [...preferredSkills, ...matchedConditionalSkills],
      stories,
    },
  })
}

export async function persistEvidenceSelectionSnapshot(source: GenerationSource) {
  const snapshot = buildEvidenceSelectionSnapshot(source)
  const relativePath = `run-${source.run.id}/evidence-selection.json`
  const destination = resolve(getArtifactsRoot(), relativePath)
  await mkdir(resolve(destination, '..'), { recursive: true })
  const json = JSON.stringify(snapshot, null, 2)
  await writeFile(destination, json)
  saveGenerationEvidenceSnapshot(source.run.id, json, relativePath)
  return snapshot
}
