import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { applicationGenerationPromptVersion } from '../ai/prompts/application-generation'
import {
  type GenerationSource,
  getBaselineGenerationRun,
  saveBaselineGenerationEvidenceSnapshot,
  saveGenerationEvidenceSnapshot,
} from '../db/generation'
import { getArtifactsRoot } from './artifact-storage'
import { loadCareerData } from './career-data'
import { todayISO } from './date'
import { generationEligibleRequirements } from './skills/generation-eligibility'
import { calculateSkillScores } from './skills/score'

export const snapshotSkillRequirementSchema = z.object({
  skillName: z.string(),
  category: z.string().nullable(),
  importance: z.string(),
  analysisResult: z.string(),
  userDecision: z.string(),
  decisionReason: z.string().nullable(),
  rawLabel: z.string().nullable(),
  sourceText: z.string().nullable(),
})

export const snapshotProvenanceSchema = z.object({
  skillName: z.string(),
  source: z.enum(['career-evidence', 'application-only']),
  reason: z.string().nullable(),
})

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
    publications: z.number().int(),
    projects: z.number().int(),
    skills: z.number().int(),
    stories: z.number().int(),
    profile: z.number().int(),
  }),
  profile: z.object({ id: z.string(), lastUpdated: z.string() }),
  selection: z.object({
    experienceIds: z.array(z.string()),
    achievementIds: z.array(z.string()),
    publicationIds: z.array(z.string()),
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
    publications: z.array(z.unknown()),
    projects: z.array(z.unknown()),
    skills: z.array(z.unknown()),
    stories: z.array(z.unknown()),
  }),
  skillRequirements: z.array(snapshotSkillRequirementSchema).optional().default([]),
  scores: z
    .object({
      canonicalMatch: z.object({
        matchedWeight: z.number(),
        totalWeight: z.number(),
        percentage: z.number().nullable(),
      }),
      applicationCoverage: z.object({
        matchedWeight: z.number(),
        totalWeight: z.number(),
        percentage: z.number().nullable(),
      }),
    })
    .optional(),
  versions: z
    .object({
      parserPrompt: z.string().nullable(),
      generationPrompt: z.string(),
    })
    .optional(),
  provenance: z.array(snapshotProvenanceSchema).optional().default([]),
})

export type EvidenceSelectionSnapshot = z.infer<typeof evidenceSelectionSnapshotSchema>

export const baselineEvidenceSelectionSnapshotSchema = evidenceSelectionSnapshotSchema
  .omit({ generationRunId: true, application: true })
  .extend({
    baselineGenerationRunId: z.number().int().positive(),
    baseline: z.object({
      direction: z.string(),
      targetTitle: z.string(),
      targetKeywords: z.array(z.string()),
    }),
  })
export type BaselineEvidenceSelectionSnapshot = z.infer<
  typeof baselineEvidenceSelectionSnapshotSchema
>

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
  const publications = profile.preferredPublicationIds
    .map((id) => data.publications.publications.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
    .filter((item) => item.safeToUse)
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

  const requirements = source.requirements ?? []
  const scores = calculateSkillScores(
    requirements.map((item) => ({
      analysisResult: item.analysisResult,
      importance: item.importance,
      userDecision: item.userDecision,
    })),
  )
  const provenance = generationEligibleRequirements(requirements).map((item) => ({
    skillName: item.skillName,
    source:
      item.analysisResult === 'proven-match'
        ? ('career-evidence' as const)
        : ('application-only' as const),
    reason: item.analysisResult === 'proven-match' ? null : (item.decisionReason ?? null),
  }))

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
      publications: data.publications.schemaVersion,
      projects: data.projects.schemaVersion,
      skills: data.skills.schemaVersion,
      stories: data.stories.schemaVersion,
      profile: profile.schemaVersion,
    },
    profile: { id: profile.id, lastUpdated: profile.lastUpdated },
    selection: {
      experienceIds: experiences.map((item) => item.id),
      achievementIds: achievements.map((item) => item.id),
      publicationIds: publications.map((item) => item.id),
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
      publications,
      projects,
      skills: [...preferredSkills, ...matchedConditionalSkills],
      stories,
    },
    skillRequirements: requirements.map((item) => ({
      skillName: item.skillName,
      category: item.skillCategory,
      importance: item.importance,
      analysisResult: item.analysisResult,
      userDecision: item.userDecision,
      decisionReason: item.decisionReason ?? null,
      rawLabel: item.rawLabel ?? null,
      sourceText: item.sourceText ?? null,
    })),
    scores,
    versions: {
      parserPrompt: source.jobPosting?.parserPromptVersion ?? null,
      generationPrompt: applicationGenerationPromptVersion,
    },
    provenance,
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

export function buildBaselineEvidenceSelectionSnapshot(
  run: NonNullable<ReturnType<typeof getBaselineGenerationRun>>,
): BaselineEvidenceSelectionSnapshot {
  const data = loadCareerData()
  const profile = data.profiles.find((item) => item.id === run.direction)
  if (!profile) throw new Error(`No canonical profile exists for direction "${run.direction}".`)
  let targetKeywords: string[]
  try {
    const parsed = JSON.parse(run.targetKeywords)
    targetKeywords = z.array(z.string().trim().min(1).max(100)).catch([]).parse(parsed)
  } catch {
    targetKeywords = []
  }
  const terms = new Set(targetKeywords.map(normalise))
  const experiences = profile.experienceSelection.priorityOrder
    .map((id) => data.experiences.experiences.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const preferredAchievements = profile.preferredAchievementIds
    .map((id) => data.achievements.achievements.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const achievements = preferredAchievements.filter((item) => item.safeToUse)
  const publications = profile.preferredPublicationIds
    .map((id) => data.publications.publications.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
    .filter((item) => item.safeToUse)
  const projects = profile.preferredProjectIds
    .map((id) => data.projects.projects.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const preferredSkills = profile.preferredSkillIds
    .map((id) => data.skills.skills.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const matchedConditionalSkills = profile.conditionalSkillIds
    .filter((id) => terms.has(normalise(id)))
    .map((id) => data.skills.skills.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  const stories = profile.coverLetterStrategy.preferredStoryIds
    .map((id) => data.stories.stories.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item)
  return baselineEvidenceSelectionSnapshotSchema.parse({
    version: 1,
    generatedAt: todayISO(),
    baselineGenerationRunId: run.id,
    baseline: { direction: run.direction, targetTitle: run.targetTitle, targetKeywords },
    sourceVersions: {
      candidate: data.candidate.schemaVersion,
      experiences: data.experiences.schemaVersion,
      achievements: data.achievements.schemaVersion,
      publications: data.publications.schemaVersion,
      projects: data.projects.schemaVersion,
      skills: data.skills.schemaVersion,
      stories: data.stories.schemaVersion,
      profile: profile.schemaVersion,
    },
    profile: { id: profile.id, lastUpdated: profile.lastUpdated },
    selection: {
      experienceIds: experiences.map((item) => item.id),
      achievementIds: achievements.map((item) => item.id),
      publicationIds: publications.map((item) => item.id),
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
      publications,
      projects,
      skills: [...preferredSkills, ...matchedConditionalSkills],
      stories,
    },
  })
}

export async function persistBaselineEvidenceSelectionSnapshot(runId: number) {
  const run = getBaselineGenerationRun(runId)
  if (!run) throw new Error('Baseline generation run no longer exists.')
  const snapshot = buildBaselineEvidenceSelectionSnapshot(run)
  const relativePath = `baseline-run-${run.id}/evidence-selection.json`
  const destination = resolve(getArtifactsRoot(), relativePath)
  await mkdir(resolve(destination, '..'), { recursive: true })
  const json = JSON.stringify(snapshot, null, 2)
  await writeFile(destination, json)
  saveBaselineGenerationEvidenceSnapshot(run.id, json, relativePath)
  return snapshot
}
