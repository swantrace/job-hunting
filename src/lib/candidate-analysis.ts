import { z } from 'zod'
import { candidateFitPromptVersion, candidateFitSystemPrompt } from '../ai/prompts/candidate-fit'
import {
  type CandidateFit,
  candidateFitResponseSchema,
  candidateFitSchema,
  candidateFitSchemaVersion,
} from '../ai/schemas/candidate-fit'
import { type ApplicationAnalysisRun, listAnalysisRuns } from '../db/analysis'
import { db } from '../db/client'
import { listJobRequirements } from '../db/job-analysis'
import { getJobAnalysisState } from '../db/job-analysis-runs'
import { getApplication } from '../db/queries'
import { listApplicationSkillRequirements } from '../db/skill-queries'
import { type AnalysisRunState, classifyAnalysisRunState } from './analysis-run-state'
import { canonicalHash } from './canonical-hash'
import { careerEvidenceIds, loadCareerData } from './career-data'
import { todayISO } from './date'
import { assertEveryRequirementAssessed, validateCandidateFitEvidence } from './fit-analysis'
import { currentJobAnalysisHash } from './job-analysis-input'
import { listProfiles } from './profiles'

export const candidateAnalysisInputVersion = 2

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
  version: z.literal(2),
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
    runId: z.number().int().positive(),
    schemaVersion: z.string().nullable(),
    promptVersion: z.string().nullable(),
    summary: z.unknown().nullable(),
    classification: z.unknown().nullable(),
    requirements: z.array(requirementSnapshotSchema),
  }),
  // Skip/Include decisions and their reasons are deliberately absent: they are
  // user review state scoped to a run, never candidate-fit input.
  skillRequirements: z.array(
    z.object({
      skillId: z.number(),
      skillName: z.string(),
      category: z.string().nullable(),
      importance: z.string(),
      analysisResult: z.string(),
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

/**
 * The candidate-fit identity inputs. Decisions, reasons, and the confirmed
 * profile are intentionally excluded; only the completed Job Analysis, career
 * data, profiles, evidence, and contract versions determine freshness.
 */
export type CandidateAnalysisInputParts = {
  jobAnalysisRunId: number
  jobAnalysisResult: unknown
  requirements: unknown
  careerData: unknown
  profiles: unknown
  evidence: unknown
  candidateFitPromptVersion: string
  candidateFitSchemaVersion: string
}

export function canonicalCandidateAnalysisInputHash(input: CandidateAnalysisInputParts): string {
  return canonicalHash(input)
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
 * resume or DOCX. Returns null when no current completed structured Job
 * Analysis exists, because candidate fit depends on that result.
 */
export function buildCandidateAnalysisInput(
  jobApplicationId: number,
): CandidateAnalysisInputResult | null {
  const application = getApplication(jobApplicationId)
  if (!application || !application.jobPosting) return null
  const currentJobHash = currentJobAnalysisHash(db, application.jobPosting.id)
  const jobState = getJobAnalysisState(db, application.jobPosting.id, currentJobHash)
  const currentJobAnalysis = jobState.currentCompleted
  if (!currentJobAnalysis) return null

  const data = loadCareerData()
  const requirements = listJobRequirements(currentJobAnalysis.id)
  const skillRequirements = [...listApplicationSkillRequirements(jobApplicationId)].sort(
    (left, right) => left.skillId - right.skillId,
  )
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
    version: 2 as const,
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
      runId: currentJobAnalysis.id,
      schemaVersion: currentJobAnalysis.schemaVersion,
      promptVersion: currentJobAnalysis.promptVersion,
      summary: currentJobAnalysis.summary ? parseJsonOrNull(currentJobAnalysis.summary) : null,
      classification: {
        roleType: currentJobAnalysis.roleType,
        advertisedSeniority: currentJobAnalysis.advertisedSeniority,
        practicalSeniority: currentJobAnalysis.practicalSeniority,
        rationale: currentJobAnalysis.classificationRationale,
        functionalEmphasis: currentJobAnalysis.functionalEmphasisJson
          ? parseJsonOrNull(currentJobAnalysis.functionalEmphasisJson)
          : null,
      },
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
    })),
    profiles,
    careerData,
    sourceVersions,
  }
  const inputHash = canonicalHash(snapshot)
  return { snapshot: { ...snapshot, inputHash }, inputHash }
}

/**
 * Computes the current input hash for staleness comparison without building
 * the full snapshot twice.
 */
export function currentCandidateAnalysisHash(jobApplicationId: number) {
  return buildCandidateAnalysisInput(jobApplicationId)?.inputHash ?? null
}

export type CandidateAnalysisState = {
  state: AnalysisRunState
  latest: ApplicationAnalysisRun | null
  latestCompleted: ApplicationAnalysisRun | null
  currentCompleted: ApplicationAnalysisRun | null
  staleCompleted: ApplicationAnalysisRun | null
  reasons: string[]
}

function snapshotSubHashes(snapshot: unknown) {
  const record = (snapshot ?? {}) as Record<string, unknown>
  return {
    jobAnalysis: canonicalHash(record.jobAnalysis ?? null),
    careerData: canonicalHash(record.careerData ?? null),
    profiles: canonicalHash(record.profiles ?? null),
    version: record.version,
  }
}

function safeParseSnapshot(json: string | null): unknown {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function candidateStalenessReasons(current: unknown, stored: unknown) {
  const currentSub = snapshotSubHashes(current)
  const storedSub = snapshotSubHashes(stored)
  const reasons: string[] = []
  if (currentSub.jobAnalysis !== storedSub.jobAnalysis) reasons.push('job-analysis-changed')
  if (currentSub.careerData !== storedSub.careerData) reasons.push('career-data-changed')
  if (currentSub.profiles !== storedSub.profiles) reasons.push('profiles-changed')
  if (currentSub.version !== storedSub.version) reasons.push('candidate-contract-changed')
  return reasons
}

/**
 * Classifies one application's Candidate Analysis run history against current
 * inputs. A failed latest attempt never hides an older completed result, and
 * stale results carry controlled reason codes for the Review UI.
 */
export function getCandidateAnalysisState(jobApplicationId: number): CandidateAnalysisState {
  const runs = listAnalysisRuns(jobApplicationId)
  const currentInput = buildCandidateAnalysisInput(jobApplicationId)
  const result = classifyAnalysisRunState(
    runs.map((run) => ({
      id: run.id,
      status: run.status,
      inputHash: run.inputHash,
      schemaVersion: run.schemaVersion,
    })),
    currentInput?.inputHash ?? null,
    candidateFitSchemaVersion,
  )
  const byId = new Map(runs.map((run) => [run.id, run]))
  const resolve = (id: number | null | undefined) => (id == null ? null : (byId.get(id) ?? null))
  const staleCompleted = resolve(result.staleCompleted?.id)

  let reasons: string[] = []
  if (result.state === 'stale' && staleCompleted && currentInput) {
    reasons = candidateStalenessReasons(
      currentInput.snapshot,
      safeParseSnapshot(staleCompleted.inputSnapshotJson),
    )
  }
  return {
    state: result.state,
    latest: resolve(result.latest?.id),
    latestCompleted: resolve(result.latestCompleted?.id),
    currentCompleted: resolve(result.currentCompleted?.id),
    staleCompleted,
    reasons,
  }
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
      process.env.OPENAI_MODEL_CANDIDATE_FIT ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5.6-terra',
    input: snapshot,
  })
  return validateCandidateAnalysisResult(result, snapshot)
}
