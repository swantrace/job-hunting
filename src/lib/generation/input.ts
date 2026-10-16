import { coverLetterModelId, resumeModelId } from '../../ai/models'
import { documentDraftPromptVersion } from '../../ai/prompts/document-draft'
import { documentDraftSchemaVersion } from '../../ai/schemas/document-draft'
import { listRunDecisions } from '../../db/analysis-decisions'
import { db } from '../../db/client'
import { getGenerationSourceLineage } from '../../db/generation'
import { getApplication } from '../../db/queries'
import { getCandidateAnalysisState } from '../candidate/analysis'
import { canonicalHash } from '../canonical-hash'
import { loadCareerData } from '../career/canonical-data'
import {
  baseResumeIdentity,
  buildDocumentDraftSnapshot,
  type DocumentDraftSnapshot,
  directionDocumentPolicy,
  safeCareerData,
} from '../document-draft/input'
import { docxRendererVersion } from '../docx/styles'

export const generationInputVersion = 4

export type GenerationInputParts = {
  candidateAnalysisRunId: number
  candidateAnalysisInputHash: string
  direction: string
  decisions: { skillId: number; decision: string }[]
  reasons: { skillId: number; reason: string }[]
  evidenceHash: string
  baseResumeHash: string | null
  baseResumeVersion: string | null
  /** The effective direction rules the drafting prompt and validation consumed. */
  directionPolicyHash: string
  generationPromptVersion: string
  generationSchemaVersion: string
  rendererVersion: string
  resumeModel: string
  coverLetterModel: string
}

export type GenerationInput = GenerationInputParts & { version: typeof generationInputVersion }

/**
 * The stored run snapshot: the identity parts plus the exact drafting input
 * captured at enqueue. The worker consumes `draftSnapshot` so career edits made
 * while a run is queued cannot change what it drafts. Older snapshots omit the
 * field and are rebuilt from live lineage.
 */
export type GenerationInputSnapshot = GenerationInput & {
  draftSnapshot: DocumentDraftSnapshot | null
}

export function canonicalGenerationInputHash(input: GenerationInputParts): string {
  return canonicalHash(input)
}

/**
 * Career evidence identity: the safe generation-relevant facts assembled from
 * the database. Data outside the document shape — preserved legacy documents and
 * category display ordering — is deliberately outside this identity, so it never
 * marks unrelated documents stale.
 */
function evidenceSourceHash() {
  return canonicalHash(safeCareerData(loadCareerData()))
}

/**
 * Freezes the drafting input at enqueue. Returns null when the direction has no
 * approved Base Resume yet; the worker then reports the same actionable error it
 * always did instead of the enqueue path throwing.
 */
function frozenDraftSnapshot(candidateAnalysisRunId: number): DocumentDraftSnapshot | null {
  const lineage = getGenerationSourceLineage(candidateAnalysisRunId)
  if (!lineage) return null
  try {
    return buildDocumentDraftSnapshot({
      application: lineage.application,
      company: lineage.company,
      jobPosting: lineage.jobPosting,
      jobRequirements: lineage.jobRequirements,
      requirements: lineage.requirements,
    })
  } catch {
    return null
  }
}

/**
 * Builds the frozen generation input identity from the current Review: current
 * completed Candidate Analysis, the application's direction, run-scoped
 * decisions, and the database-owned career evidence plus the configured
 * generation contract and models. The snapshot also carries the exact drafting
 * input so a queued run stays isolated from later career edits.
 */
export function buildGenerationInput(jobApplicationId: number) {
  const state = getCandidateAnalysisState(jobApplicationId)
  const current = state.currentCompleted
  const job = getApplication(jobApplicationId)
  if (!current || !job) return null

  const decisions = listRunDecisions(db, current.id)
    .filter((decision) => decision.decision === 'skip' || decision.decision === 'include')
    .sort((left, right) => left.skillId - right.skillId)

  const parts: GenerationInputParts = {
    candidateAnalysisRunId: current.id,
    candidateAnalysisInputHash: current.inputHash ?? '',
    direction: job.direction,
    decisions: decisions.map((decision) => ({
      skillId: decision.skillId,
      decision: decision.decision,
    })),
    reasons: decisions
      .filter((decision) => decision.decision === 'include')
      .map((decision) => ({ skillId: decision.skillId, reason: decision.reason ?? '' })),
    evidenceHash: evidenceSourceHash(),
    ...baseResumeIdentity(job.direction),
    directionPolicyHash: canonicalHash(directionDocumentPolicy(job.direction)),
    generationPromptVersion: documentDraftPromptVersion,
    generationSchemaVersion: documentDraftSchemaVersion,
    rendererVersion: docxRendererVersion,
    resumeModel: resumeModelId(),
    coverLetterModel: coverLetterModelId(),
  }
  const snapshot: GenerationInputSnapshot = {
    version: generationInputVersion,
    ...parts,
    draftSnapshot: frozenDraftSnapshot(current.id),
  }
  return { snapshot, inputHash: canonicalGenerationInputHash(parts) }
}

export function currentGenerationInputHash(jobApplicationId: number) {
  return buildGenerationInput(jobApplicationId)?.inputHash ?? null
}

/**
 * Reads the drafting input frozen at enqueue from a stored run snapshot. Legacy
 * snapshots (and any snapshot whose direction lacked an approved Base Resume)
 * have no `draftSnapshot`; callers then rebuild from live lineage.
 */
export function frozenDraftSnapshotFromRun(
  frozenInputJson: string | null,
): DocumentDraftSnapshot | null {
  if (!frozenInputJson) return null
  try {
    const parsed = JSON.parse(frozenInputJson) as { draftSnapshot?: unknown }
    return (parsed.draftSnapshot as DocumentDraftSnapshot | null | undefined) ?? null
  } catch {
    return null
  }
}

function generationSubHashes(snapshot: unknown) {
  const record = (snapshot ?? {}) as Record<string, unknown>
  return {
    candidateAnalysisInputHash: record.candidateAnalysisInputHash,
    direction: record.direction,
    decisions: canonicalHash(record.decisions ?? []),
    evidenceHash: record.evidenceHash,
    directionPolicy: record.directionPolicyHash,
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
  if (currentSub.direction !== storedSub.direction) reasons.push('direction-changed')
  if (currentSub.decisions !== storedSub.decisions) reasons.push('skill-decisions-changed')
  if (currentSub.evidenceHash !== storedSub.evidenceHash) reasons.push('career-evidence-changed')
  if (currentSub.directionPolicy !== storedSub.directionPolicy)
    reasons.push('direction-rules-changed')
  if (currentSub.baseResume !== storedSub.baseResume) reasons.push('base-resume-changed')
  if (currentSub.contract !== storedSub.contract) reasons.push('generation-contract-changed')
  if (currentSub.renderer !== storedSub.renderer) reasons.push('renderer-contract-changed')
  if (currentSub.models !== storedSub.models) reasons.push('generation-model-changed')
  return reasons
}
