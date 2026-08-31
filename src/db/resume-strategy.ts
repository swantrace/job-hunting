import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCandidateAnalysisState } from '../lib/candidate-analysis'
import { type CanonicalCareerData, loadCareerData } from '../lib/career-data'
import { todayISO } from '../lib/date'
import { parseCandidateFitResult } from '../lib/evidence/status'
import {
  type ApplicationAnalysisRun,
  analysisRunBelongsToApplication,
  getAnalysisRun,
} from './analysis'
import { db } from './client'
import { type AnalysisRunResumeStrategy, analysisRunResumeStrategies } from './schema'

/**
 * User-confirmed, run-scoped, deterministic resume strategy. It is never
 * LLM-authored; it only selects emphasis among the evidence the candidate
 * analysis already allowlisted. Content is validated here (the single
 * authoritative service) before any insert, and read back with the same shape.
 */
export const resumeStrategyContentSchema = z
  .object({
    positioning: z.string().trim().min(1).max(500),
    primaryThemes: z.array(z.string().trim().min(1).max(120)).min(1).max(3),
    emphasizeEvidenceIds: z.array(z.string().trim().min(1).max(200)).max(200),
    deemphasizeEvidenceIds: z.array(z.string().trim().min(1).max(200)).max(200),
  })
  .superRefine((value, ctx) => {
    const emphasize = new Set(value.emphasizeEvidenceIds)
    if (emphasize.size !== value.emphasizeEvidenceIds.length)
      ctx.addIssue({
        code: 'custom',
        message: 'The emphasize list must not contain duplicates.',
        path: ['emphasizeEvidenceIds'],
      })
    const deemphasize = new Set(value.deemphasizeEvidenceIds)
    if (deemphasize.size !== value.deemphasizeEvidenceIds.length)
      ctx.addIssue({
        code: 'custom',
        message: 'The de-emphasize list must not contain duplicates.',
        path: ['deemphasizeEvidenceIds'],
      })
    const overlap = value.emphasizeEvidenceIds.filter((id) => deemphasize.has(id))
    if (overlap.length)
      ctx.addIssue({
        code: 'custom',
        message: `Evidence cannot be both emphasized and de-emphasized: ${overlap[0]}.`,
        path: ['deemphasizeEvidenceIds'],
      })
  })

export type ResumeStrategyContent = z.infer<typeof resumeStrategyContentSchema>

export type ResumeStrategy = ResumeStrategyContent & {
  applicationAnalysisRunId: number
  createdAt: string
  updatedAt: string
}

export type ResumeStrategySaveResult =
  | { ok: true; strategy: ResumeStrategy }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> }

/** The allowlisted evidence IDs from the run's selected (direct/transferable) evidence. */
export function runEvidenceAllowlist(run: ApplicationAnalysisRun | null): Set<string> {
  const ids = new Set<string>()
  const fit = parseCandidateFitResult(run?.resultJson)
  for (const assessment of fit?.requirementAssessments ?? []) {
    if (assessment.evidenceStatus === 'direct' || assessment.evidenceStatus === 'transferable')
      for (const ref of assessment.evidenceRefs) ids.add(`${ref.sourceType}:${ref.sourceId}`)
  }
  return ids
}

/**
 * Deterministic default draft from the confirmed profile plus the run's
 * direct/transferable evidence. No LLM is called and no facts are invented.
 */
export function buildResumeStrategyDraftFromRun(
  run: ApplicationAnalysisRun | null,
  data: CanonicalCareerData,
): ResumeStrategyContent | null {
  if (!run || run.status !== 'Completed' || !run.confirmedProfileId) return null
  const fit = parseCandidateFitResult(run.resultJson)
  if (!fit) return null
  const profile = data.profiles.find((item) => item.id === run.confirmedProfileId)
  const positioning = profile?.targetTitles?.[0] ?? profile?.label ?? run.confirmedProfileId
  const themes = (profile?.preferredSkillIds ?? [])
    .map((id) => data.skills.skills.find((skill) => skill.id === id)?.label)
    .filter((label): label is string => Boolean(label))
    .slice(0, 3)
  const emphasizeEvidenceIds = [
    ...new Set(
      (fit.requirementAssessments ?? [])
        .filter(
          (assessment) =>
            assessment.evidenceStatus === 'direct' || assessment.evidenceStatus === 'transferable',
        )
        .flatMap((assessment) =>
          assessment.evidenceRefs.map((ref) => `${ref.sourceType}:${ref.sourceId}`),
        ),
    ),
  ].sort()
  return {
    positioning,
    primaryThemes: themes.length ? themes : [positioning],
    emphasizeEvidenceIds,
    deemphasizeEvidenceIds: [],
  }
}

export function buildResumeStrategyDraft(runId: number): ResumeStrategyContent | null {
  return buildResumeStrategyDraftFromRun(getAnalysisRun(runId), loadCareerData())
}

function parseRow(row: AnalysisRunResumeStrategy): ResumeStrategy | null {
  try {
    return {
      applicationAnalysisRunId: row.applicationAnalysisRunId,
      positioning: row.positioning,
      primaryThemes: z.array(z.string()).parse(JSON.parse(row.primaryThemes)),
      emphasizeEvidenceIds: z.array(z.string()).parse(JSON.parse(row.emphasizeEvidenceIds)),
      deemphasizeEvidenceIds: z.array(z.string()).parse(JSON.parse(row.deemphasizeEvidenceIds)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  } catch {
    return null
  }
}

export function getResumeStrategy(runId: number): ResumeStrategy | null {
  const row = db
    .select()
    .from(analysisRunResumeStrategies)
    .where(eq(analysisRunResumeStrategies.applicationAnalysisRunId, runId))
    .get()
  return row ? parseRow(row) : null
}

/**
 * The single authoritative save path. Validates run lineage/currentness, a
 * confirmed profile, bounded content, JSON shape, allowlisted evidence IDs,
 * duplicates, and emphasize/de-emphasize overlap before any insert.
 */
export function saveResumeStrategy(
  applicationId: number,
  runId: number,
  input: unknown,
): ResumeStrategySaveResult {
  const run = getAnalysisRun(runId)
  if (!run || run.status !== 'Completed' || !analysisRunBelongsToApplication(runId, applicationId))
    return { ok: false, message: 'Candidate analysis run is not available.' }

  const state = getCandidateAnalysisState(applicationId)
  if (state.currentCompleted?.id !== runId)
    return {
      ok: false,
      message: 'Candidate analysis is stale — re-run it before editing the resume strategy.',
    }
  if (!run.confirmedProfileId) return { ok: false, message: 'Confirm a generation profile first.' }

  const parsed = resumeStrategyContentSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      message: 'The resume strategy is invalid.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }

  const allowlist = runEvidenceAllowlist(run)
  const unknown = [...parsed.data.emphasizeEvidenceIds, ...parsed.data.deemphasizeEvidenceIds].find(
    (id) => !allowlist.has(id),
  )
  if (unknown) return { ok: false, message: `Unknown evidence ID "${unknown}".` }

  const date = todayISO()
  const row = db
    .insert(analysisRunResumeStrategies)
    .values({
      applicationAnalysisRunId: runId,
      positioning: parsed.data.positioning,
      primaryThemes: JSON.stringify(parsed.data.primaryThemes),
      emphasizeEvidenceIds: JSON.stringify(parsed.data.emphasizeEvidenceIds),
      deemphasizeEvidenceIds: JSON.stringify(parsed.data.deemphasizeEvidenceIds),
      createdAt: date,
      updatedAt: date,
    })
    .onConflictDoUpdate({
      target: analysisRunResumeStrategies.applicationAnalysisRunId,
      set: {
        positioning: parsed.data.positioning,
        primaryThemes: JSON.stringify(parsed.data.primaryThemes),
        emphasizeEvidenceIds: JSON.stringify(parsed.data.emphasizeEvidenceIds),
        deemphasizeEvidenceIds: JSON.stringify(parsed.data.deemphasizeEvidenceIds),
        updatedAt: date,
      },
    })
    .returning()
    .get()

  const strategy = parseRow(row)
  return strategy ? { ok: true, strategy } : { ok: false, message: 'Failed to save the strategy.' }
}
