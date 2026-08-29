import { createHash } from 'node:crypto'
import { z } from 'zod'
import { candidateFitPromptVersion, candidateFitSystemPrompt } from '../ai/prompts/candidate-fit'
import {
  type CandidateFit,
  candidateFitResponseSchema,
  candidateFitSchema,
} from '../ai/schemas/candidate-fit'
import { listJobRequirements } from '../db/job-analysis'
import { getApplication } from '../db/queries'
import { listApplicationSkillRequirements } from '../db/skill-queries'
import { careerEvidenceIds, loadCareerData } from './career-data'
import { todayISO } from './date'
import { assertEveryRequirementAssessed, validateCandidateFitEvidence } from './fit-analysis'
import { listProfiles } from './profiles'

export const candidateAnalysisInputVersion = 1

const requirementSnapshotSchema = z.object({
  id: z.number().int().positive(),
  sequence: z.number().int().positive(),
  type: z.string(),
  importance: z.string(),
  basis: z.string(),
  statement: z.string(),
  sourceText: z.string().nullable(),
})

export const candidateAnalysisInputSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  application: z.object({
    id: z.number().int().positive(),
    direction: z.string(),
    jobTitle: z.string(),
    company: z.string(),
  }),
  jobPosting: z.object({
    contentHash: z.string(),
    rawText: z.string(),
  }),
  jobAnalysis: z.object({
    schemaVersion: z.string().nullable(),
    promptVersion: z.string().nullable(),
    summary: z.unknown().nullable(),
    classification: z.unknown().nullable(),
    requirements: z.array(requirementSnapshotSchema),
  }),
  skillRequirements: z.array(
    z.object({
      skillId: z.number(),
      skillName: z.string(),
      category: z.string().nullable(),
      importance: z.string(),
      analysisResult: z.string(),
      userDecision: z.string(),
      decisionReason: z.string().nullable(),
    }),
  ),
  profiles: z.array(z.unknown()),
  careerData: z.unknown(),
  sourceVersions: z.record(z.string(), z.number()),
  inputHash: z.string(),
})

export type CandidateAnalysisInput = z.infer<typeof candidateAnalysisInputSchema>

export type CandidateAnalysisInputResult = {
  snapshot: CandidateAnalysisInput
  inputHash: string
}

function parseJsonOrNull(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Builds the frozen canonical input for one application. This is the only
 * factual source the candidate model sees; it never receives a generated
 * resume or DOCX.
 */
export function buildCandidateAnalysisInput(
  jobApplicationId: number,
): CandidateAnalysisInputResult | null {
  const application = getApplication(jobApplicationId)
  if (!application || !application.jobPosting) return null
  const data = loadCareerData()
  const requirements = application.jobPostingAnalysis
    ? listJobRequirements(application.jobPostingAnalysis.id)
    : []
  const skillRequirements = listApplicationSkillRequirements(jobApplicationId)
  const profiles = listProfiles().map((profile) => {
    const canonical = data.profiles.find((item) => item.id === profile.id)
    return { ...profile, ...(canonical ?? {}) }
  })
  const sourceVersions = {
    candidate: data.candidate.schemaVersion,
    experiences: data.experiences.schemaVersion,
    achievements: data.achievements.schemaVersion,
    publications: data.publications.schemaVersion,
    projects: data.projects.schemaVersion,
    skills: data.skills.schemaVersion,
    stories: data.stories.schemaVersion,
    profile: data.profiles[0]?.schemaVersion ?? 1,
  }
  const careerData = {
    candidate: data.candidate,
    experiences: data.experiences.experiences,
    achievements: data.achievements.achievements.filter((item) => item.safeToUse),
    publications: data.publications.publications.filter((item) => item.safeToUse),
    projects: data.projects.projects,
    skills: data.skills.skills,
    stories: data.stories.stories,
  }

  const snapshot = {
    version: 1 as const,
    generatedAt: todayISO(),
    application: {
      id: application.id,
      direction: application.direction,
      jobTitle: application.jobTitle,
      company: application.companyName,
    },
    jobPosting: {
      contentHash: application.jobPosting.contentHash,
      rawText: application.jobPosting.rawText,
    },
    jobAnalysis: {
      schemaVersion: application.jobPostingAnalysis?.schemaVersion ?? null,
      promptVersion: application.jobPostingAnalysis?.promptVersion ?? null,
      summary: application.jobPostingAnalysis?.summary
        ? parseJsonOrNull(application.jobPostingAnalysis.summary)
        : null,
      classification: application.jobPostingAnalysis
        ? {
            roleType: application.jobPostingAnalysis.roleType,
            advertisedSeniority: application.jobPostingAnalysis.advertisedSeniority,
            practicalSeniority: application.jobPostingAnalysis.practicalSeniority,
            rationale: application.jobPostingAnalysis.classificationRationale,
            functionalEmphasis: application.jobPostingAnalysis.functionalEmphasisJson
              ? parseJsonOrNull(application.jobPostingAnalysis.functionalEmphasisJson)
              : null,
          }
        : null,
      requirements: requirements.map((requirement) => ({
        id: requirement.id,
        sequence: requirement.sequence,
        type: requirement.requirementType,
        importance: requirement.importance,
        basis: requirement.basis,
        statement: requirement.statement,
        sourceText: requirement.sourceText,
      })),
    },
    skillRequirements: skillRequirements.map((item) => ({
      skillId: item.skillId,
      skillName: item.skillName,
      category: item.skillCategory,
      importance: item.importance,
      analysisResult: item.analysisResult,
      userDecision: item.userDecision,
      decisionReason: item.decisionReason,
    })),
    profiles,
    careerData,
    sourceVersions,
  }
  const inputHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  return { snapshot: { ...snapshot, inputHash }, inputHash }
}

/**
 * Computes the current input hash for staleness comparison without building
 * the full snapshot twice.
 */
export function currentCandidateAnalysisHash(jobApplicationId: number) {
  return buildCandidateAnalysisInput(jobApplicationId)?.inputHash ?? null
}

export function validateCandidateAnalysisResult(
  result: CandidateFit,
  snapshot: CandidateAnalysisInput,
) {
  const data = loadCareerData()
  const evidence = careerEvidenceIds(data)
  const requirementIds = snapshot.jobAnalysis.requirements.map((item) => item.id)
  const profileIds = snapshot.profiles
    .map((profile) => (profile as { id?: string }).id)
    .filter((id): id is string => typeof id === 'string')
  validateCandidateFitEvidence(result, { profileIds, evidence })
  assertEveryRequirementAssessed(requirementIds, result)
  return result
}

type JsonSchema = Record<string, unknown>

async function structuredCandidateFit(args: {
  apiKey: string
  model: string
  input: CandidateAnalysisInput
}): Promise<CandidateFit> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: args.model,
      input: [
        {
          role: 'system',
          content: `${candidateFitSystemPrompt}\nPrompt version: ${candidateFitPromptVersion}`,
        },
        { role: 'user', content: JSON.stringify(args.input) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'candidate_fit',
          strict: true,
          schema: candidateFitResponseSchema as unknown as JsonSchema,
        },
      },
    }),
  })
  if (!response.ok)
    throw new Error(
      `OpenAI candidate analysis request failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
    )
  const body = (await response.json()) as {
    output_text?: string
    output?: { content?: { text?: string }[] }[]
  }
  const output =
    body.output_text ??
    body.output?.flatMap((item) => item.content ?? []).find((part) => part.text)?.text
  if (!output) throw new Error('OpenAI returned no candidate analysis content.')
  return candidateFitSchema.parse(JSON.parse(output))
}

export async function runCandidateAnalysis(runId: number) {
  const { getAnalysisRun } = await import('../db/analysis')
  const run = getAnalysisRun(runId)
  if (!run) throw new Error('Analysis run no longer exists.')
  if (!run.inputSnapshotJson) throw new Error('Analysis run has no frozen input snapshot.')
  const snapshot = candidateAnalysisInputSchema.parse(JSON.parse(run.inputSnapshotJson))
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  const result = await structuredCandidateFit({
    apiKey,
    model:
      process.env.OPENAI_MODEL_CANDIDATE_FIT ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini',
    input: snapshot,
  })
  return validateCandidateAnalysisResult(result, snapshot)
}
