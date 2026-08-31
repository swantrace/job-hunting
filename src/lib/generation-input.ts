import { documentDraftPromptVersion } from '../ai/prompts/document-draft'
import { documentDraftSchemaVersion } from '../ai/schemas/document-draft'
import { listRunDecisions } from '../db/analysis-decisions'
import { db } from '../db/client'
import { getCandidateAnalysisState } from './candidate-analysis'
import { canonicalHash } from './canonical-hash'
import { loadCareerData } from './career-data'
import { baseResumeIdentity } from './document-draft-input'
import { docxRendererVersion } from './docx/styles'

export const generationInputVersion = 2

export type GenerationInputParts = {
  candidateAnalysisRunId: number
  candidateAnalysisInputHash: string
  confirmedProfileId: string
  decisions: { skillId: number; decision: string }[]
  reasons: { skillId: number; reason: string }[]
  evidenceHash: string
  baseResumeHash: string | null
  baseResumeVersion: string | null
  generationPromptVersion: string
  generationSchemaVersion: string
  rendererVersion: string
  resumeModel: string
  coverLetterModel: string
}

export type GenerationInput = GenerationInputParts & { version: typeof generationInputVersion }

export function canonicalGenerationInputHash(input: GenerationInputParts): string {
  return canonicalHash(input)
}

export function resumeModelId() {
  return process.env.OPENAI_MODEL_RESUME ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5.6-sol'
}

export function coverLetterModelId() {
  return (
    process.env.OPENAI_MODEL_COVER_LETTER ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5.6-terra'
  )
}

function evidenceSourceHash() {
  return canonicalHash(loadCareerData())
}

/**
 * Builds the frozen generation input identity from the current Review: current
 * completed Candidate Analysis, confirmed profile, run-scoped decisions, and
 * canonical evidence plus the configured generation contract and models.
 */
export function buildGenerationInput(jobApplicationId: number) {
  const state = getCandidateAnalysisState(jobApplicationId)
  const current = state.currentCompleted
  if (!current || !current.confirmedProfileId) return null

  const decisions = listRunDecisions(db, current.id)
    .filter((decision) => decision.decision === 'skip' || decision.decision === 'include')
    .sort((left, right) => left.skillId - right.skillId)

  const parts: GenerationInputParts = {
    candidateAnalysisRunId: current.id,
    candidateAnalysisInputHash: current.inputHash ?? '',
    confirmedProfileId: current.confirmedProfileId,
    decisions: decisions.map((decision) => ({
      skillId: decision.skillId,
      decision: decision.decision,
    })),
    reasons: decisions
      .filter((decision) => decision.decision === 'include')
      .map((decision) => ({ skillId: decision.skillId, reason: decision.reason ?? '' })),
    evidenceHash: evidenceSourceHash(),
    ...baseResumeIdentity(current.confirmedProfileId),
    generationPromptVersion: documentDraftPromptVersion,
    generationSchemaVersion: documentDraftSchemaVersion,
    rendererVersion: docxRendererVersion,
    resumeModel: resumeModelId(),
    coverLetterModel: coverLetterModelId(),
  }
  const snapshot: GenerationInput = { version: generationInputVersion, ...parts }
  return { snapshot, inputHash: canonicalGenerationInputHash(parts) }
}

export function currentGenerationInputHash(jobApplicationId: number) {
  return buildGenerationInput(jobApplicationId)?.inputHash ?? null
}

function generationSubHashes(snapshot: unknown) {
  const record = (snapshot ?? {}) as Record<string, unknown>
  return {
    candidateAnalysisInputHash: record.candidateAnalysisInputHash,
    confirmedProfileId: record.confirmedProfileId,
    decisions: canonicalHash(record.decisions ?? []),
    evidenceHash: record.evidenceHash,
    baseResume: canonicalHash({
      hash: record.baseResumeHash,
      version: record.baseResumeVersion,
    }),
    contract: canonicalHash({
      promptVersion: record.generationPromptVersion,
      schemaVersion: record.generationSchemaVersion,
    }),
    renderer: record.rendererVersion,
    models: canonicalHash({
      resumeModel: record.resumeModel,
      coverLetterModel: record.coverLetterModel,
    }),
  }
}

export function generationStalenessReasons(current: unknown, stored: unknown) {
  const currentSub = generationSubHashes(current)
  const storedSub = generationSubHashes(stored)
  const reasons: string[] = []
  if (currentSub.candidateAnalysisInputHash !== storedSub.candidateAnalysisInputHash)
    reasons.push('candidate-analysis-changed')
  if (currentSub.confirmedProfileId !== storedSub.confirmedProfileId)
    reasons.push('profile-selection-changed')
  if (currentSub.decisions !== storedSub.decisions) reasons.push('skill-decisions-changed')
  if (currentSub.evidenceHash !== storedSub.evidenceHash) reasons.push('career-evidence-changed')
  if (currentSub.baseResume !== storedSub.baseResume) reasons.push('base-resume-changed')
  if (currentSub.contract !== storedSub.contract) reasons.push('generation-contract-changed')
  if (currentSub.renderer !== storedSub.renderer) reasons.push('renderer-contract-changed')
  if (currentSub.models !== storedSub.models) reasons.push('generation-model-changed')
  return reasons
}
