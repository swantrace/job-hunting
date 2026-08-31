import { z } from 'zod'
import { applicationGenerationPromptVersion } from '../ai/prompts/application-generation'
import {
  type GenerationSource,
  getBaselineGenerationRun,
  saveBaselineGenerationEvidenceSnapshot,
  saveGenerationEvidenceSnapshot,
} from '../db/generation'
import { loadCareerData } from './career-data'
import { todayISO } from './date'
import { parseCandidateFitResult } from './evidence/status'
import { parseJobAnalysisResult } from './job-analysis-result'
import { calculateRequirementCoverage } from './requirements/score'
import { generationEligibleRequirements } from './skills/generation-eligibility'
import { calculateSkillScores } from './skills/score'

export const snapshotSkillRequirementSchema = z.object({
  skillName: z.string(),
  category: z.string().nullable(),
  importance: z.string(),
  analysisResult: z.string(),
  decision: z.string(),
  decisionReason: z.string().nullable(),
  rawLabel: z.string().nullable(),
  sourceText: z.string().nullable(),
})

export const snapshotProvenanceSchema = z.object({
  skillName: z.string(),
  source: z.enum(['career-evidence', 'application-only']),
  reason: z.string().nullable(),
})

const coveragePartSchema = z.object({
  matchedWeight: z.number(),
  totalWeight: z.number(),
  percentage: z.number().nullable(),
})

const evidenceSelectionSnapshotBaseSchema = z.object({
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
      canonicalMatch: coveragePartSchema,
      applicationCoverage: coveragePartSchema,
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

export const evidenceSelectionSnapshotV1Schema = evidenceSelectionSnapshotBaseSchema.extend({
  version: z.literal(1),
})

export const evidenceSelectionSnapshotV2Schema = evidenceSelectionSnapshotBaseSchema.extend({
  version: z.literal(2),
  analysisRunId: z.number().int().positive(),
  analysisInputHash: z.string(),
  jobAnalysisSchemaVersion: z.string().nullable(),
  candidateFitPromptVersion: z.string(),
  confirmedProfileId: z.string().nullable(),
  fitRecommendation: z.string().nullable(),
  requirementAssessments: z.array(z.unknown()),
  requirementCoverage: z.object({
    directCoverage: coveragePartSchema,
    supportedCoverage: coveragePartSchema,
  }),
  selectedEvidenceByRequirement: z.record(z.string(), z.array(z.string())),
  companyInterestNote: z.string().nullable(),
})

export const evidenceSelectionSnapshotV3Schema = evidenceSelectionSnapshotV2Schema.extend({
  version: z.literal(3),
  resumeStrategy: z
    .object({
      positioning: z.string(),
      primaryThemes: z.array(z.string()),
      emphasizeEvidenceIds: z.array(z.string()),
      deemphasizeEvidenceIds: z.array(z.string()),
    })
    .nullable(),
})

export const evidenceSelectionSnapshotSchema = z.union([
  evidenceSelectionSnapshotV1Schema,
  evidenceSelectionSnapshotV2Schema,
  evidenceSelectionSnapshotV3Schema,
])

export type EvidenceSelectionSnapshot = z.infer<typeof evidenceSelectionSnapshotSchema>
export type EvidenceSelectionSnapshotV2 = z.infer<typeof evidenceSelectionSnapshotV2Schema>
export type EvidenceSelectionSnapshotV3 = z.infer<typeof evidenceSelectionSnapshotV3Schema>

export const baselineEvidenceSelectionSnapshotSchema = evidenceSelectionSnapshotV1Schema
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
    ...(parseJobAnalysisResult(source.analysis?.resultJson ?? null)?.requirements.map(
      (requirement) => normalise(requirement.statement),
    ) ?? []),
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
      userDecision: item.decision,
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

  const base = {
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
      category: item.category,
      importance: item.importance,
      analysisResult: item.analysisResult,
      decision: item.decision,
      decisionReason: item.decisionReason ?? null,
      rawLabel: item.rawLabel ?? null,
      sourceText: item.requirementStatement ?? null,
    })),
    scores,
    versions: {
      parserPrompt: null,
      generationPrompt: applicationGenerationPromptVersion,
    },
    provenance,
  }

  const analysisRun = source.analysisRun
  if (!analysisRun?.resultJson)
    return evidenceSelectionSnapshotV1Schema.parse({ ...base, version: 1 })

  const fit = parseCandidateFitResult(analysisRun.resultJson)
  if (!fit) return evidenceSelectionSnapshotV1Schema.parse({ ...base, version: 1 })

  const assessments = fit.requirementAssessments
  const importanceById = new Map(source.jobRequirements.map((item) => [item.id, item.importance]))
  const version2 = {
    ...base,
    version: 2 as const,
    analysisRunId: analysisRun.id,
    analysisInputHash: analysisRun.inputHash ?? '',
    jobAnalysisSchemaVersion: source.analysis?.schemaVersion ?? null,
    candidateFitPromptVersion: analysisRun.promptVersion ?? '',
    confirmedProfileId: analysisRun.confirmedProfileId,
    fitRecommendation: fit.fitRecommendation,
    requirementAssessments: assessments,
    requirementCoverage: calculateRequirementCoverage(
      assessments.map((assessment) => ({
        evidenceStatus: assessment.evidenceStatus,
        importance:
          (importanceById.get(assessment.jobRequirementId) as
            | 'required'
            | 'preferred'
            | 'mentioned'
            | undefined) ?? 'mentioned',
      })),
    ),
    selectedEvidenceByRequirement: Object.fromEntries(
      assessments.map((assessment) => [
        String(assessment.jobRequirementId),
        assessment.evidenceRefs.map((ref) => `${ref.sourceType}:${ref.sourceId}`),
      ]),
    ),
    companyInterestNote: source.companyInterestNote,
  }

  const strategy = source.resumeStrategy ?? null
  if (strategy)
    return evidenceSelectionSnapshotV3Schema.parse({
      ...version2,
      version: 3,
      resumeStrategy: {
        positioning: strategy.positioning,
        primaryThemes: strategy.primaryThemes,
        emphasizeEvidenceIds: strategy.emphasizeEvidenceIds,
        deemphasizeEvidenceIds: strategy.deemphasizeEvidenceIds,
      },
    })
  return evidenceSelectionSnapshotV2Schema.parse(version2)
}

export async function persistEvidenceSelectionSnapshot(source: GenerationSource) {
  const snapshot = buildEvidenceSelectionSnapshot(source)
  saveGenerationEvidenceSnapshot(source.run.id, JSON.stringify(snapshot, null, 2))
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
  saveBaselineGenerationEvidenceSnapshot(run.id, JSON.stringify(snapshot, null, 2))
  return snapshot
}
