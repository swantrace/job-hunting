import { listCareerDirections, readCareerDirection } from '../../db/career-directions'
import { db } from '../../db/client'
import type { DbExecutor } from '../../db/skill-queries'
import { type AtsImportance, type AtsTerm, atsImportanceWeight } from '../ats-audit'
import { canonicalHash } from '../canonical-hash'
import {
  type FrozenBaseResumeSource,
  frozenBaseResumeSource,
  loadApprovedBaseResume,
} from '../career/base-resumes'
import {
  type CanonicalCareerData,
  documentSafeCareerData,
  loadCareerData,
} from '../career/canonical-data'
import { directionTargetTitles } from '../career/directions'
import { todayISO } from '../date'
import {
  generationEligibleRequirements,
  isGenerationEligible,
} from '../skills/generation-eligibility'
import { type DocumentDraftPolicy, effectiveDocumentDraftPolicy } from './policy'

/**
 * Builds the frozen drafting input: approved Base Resume (editorial prior),
 * complete safe canonical Career Data (factual authority), the reviewed Job
 * Description, user-confirmed application metadata, and resolved Include/Skip
 * decisions plus the direction's target titles.
 */

export type DocumentDraftRequirement = {
  skillName: string
  importance: string
  analysisResult: string
  decision: string
  decisionReason: string | null
  rawLabel: string | null
  sourceText: string | null
}

export type DocumentDraftSnapshot = {
  version: 2
  generatedAt: string
  kind: 'application' | 'baseline'
  direction: string
  targetTitles: string[]
  baseResume: FrozenBaseResumeSource | null
  application: {
    id: number
    jobTitle: string
    company: string
    location: string | null
    url: string | null
  } | null
  jobPosting: { contentHash: string; rawText: string } | null
  jobRequirements: Array<{
    sequence: number
    type: string
    importance: string
    basis: string
    statement: string
    sourceText: string | null
  }>
  requirements: DocumentDraftRequirement[]
  excludedSkills: string[]
  documentPolicy: DocumentDraftPolicy
  careerData: ReturnType<typeof safeCareerData>
}

const auditImportances: Record<string, AtsImportance> = {
  preferred: 'preferred',
  mentioned: 'mentioned',
  required: 'required',
}

/**
 * The Job Description terms the ATS keyword audit checks generated text against,
 * read from the same frozen snapshot the drafts are written from: every
 * generation-eligible requirement (its raw JD label kept as an alias) and every
 * excluded skill, reported as a term that must not be added because no evidence
 * supports it. Duplicate skills are merged, keeping the strongest importance.
 */
export function documentDraftAuditTerms(snapshot: DocumentDraftSnapshot): AtsTerm[] {
  const bySkill = new Map<string, AtsTerm>()
  const merge = (term: AtsTerm) => {
    const key = term.canonical.trim().toLowerCase()
    if (key === '') return
    const aliases = [...new Set(term.aliases.map((alias) => alias.trim()).filter(Boolean))]
    const existing = bySkill.get(key)
    if (!existing) {
      bySkill.set(key, { ...term, aliases })
      return
    }
    existing.aliases = [...new Set([...existing.aliases, ...aliases])]
    if (
      atsImportanceWeight(term.importance ?? 'required') >
      atsImportanceWeight(existing.importance ?? 'required')
    )
      existing.importance = term.importance
    existing.evidenceEligible = existing.evidenceEligible || term.evidenceEligible
  }

  for (const requirement of snapshot.requirements)
    merge({
      canonical: requirement.skillName,
      aliases:
        requirement.rawLabel && requirement.rawLabel !== requirement.skillName
          ? [requirement.rawLabel]
          : [],
      evidenceEligible: true,
      importance: auditImportances[requirement.importance] ?? 'required',
    })
  for (const skill of snapshot.excludedSkills)
    merge({ canonical: skill, aliases: [], evidenceEligible: false, importance: 'required' })

  return [...bySkill.values()]
}

export function safeCareerData(
  data: CanonicalCareerData,
  options: { includeSourceUrls?: boolean } = {},
) {
  return documentSafeCareerData(data, options)
}

/**
 * The effective drafting policy for a direction. Stored direction rules override
 * the documented default, and the resolved policy is what both the prompt and
 * deterministic validation consume, so the two can never disagree.
 */
export function directionDocumentPolicy(
  direction: string,
  executor: DbExecutor = db,
): DocumentDraftPolicy {
  return effectiveDocumentDraftPolicy(readCareerDirection(executor, direction)?.rules ?? null)
}

/**
 * Active direction keys, read straight from the database repository. The
 * drafting path must not depend on a wrapper that a UI test can stub.
 */
function knownDirectionIds(executor: DbExecutor) {
  return new Set(listCareerDirections(executor).map((direction) => direction.key))
}

/** Loads the frozen approved Base Resume for a direction, or null when absent. */
export function baseResumeSourceFor(
  direction: string,
  executor: DbExecutor = db,
): FrozenBaseResumeSource | null {
  const resume = loadApprovedBaseResume(direction, knownDirectionIds(executor), executor)
  return resume ? frozenBaseResumeSource(resume) : null
}

export function baseResumeIdentity(
  direction: string,
  executor: DbExecutor = db,
): {
  baseResumeHash: string | null
  baseResumeVersion: string | null
} {
  const source = baseResumeSourceFor(direction, executor)
  return {
    baseResumeHash: source?.sha256 ?? null,
    baseResumeVersion: source?.version ?? null,
  }
}

type GenerationSourceLike = {
  application: {
    id: number
    direction: string
    jobTitle: string
    location: string | null
    url: string | null
  }
  company: { name: string }
  jobPosting: { contentHash: string; rawText: string } | undefined
  jobRequirements: Array<{
    sequence: number
    requirementType: string
    importance: string
    basis: string
    statement: string
    sourceText: string | null
  }>
  requirements: Array<{
    skillName: string
    importance: string
    analysisResult: string
    decision: string
    decisionReason: string | null
    rawLabel: string | null
    requirementStatement: string
  }>
}

export function buildDocumentDraftSnapshot(
  source: GenerationSourceLike,
  executor: DbExecutor = db,
): DocumentDraftSnapshot {
  const data = loadCareerData(executor)
  const baseResume = baseResumeSourceFor(source.application.direction, executor)
  if (!baseResume)
    throw new Error(
      `No approved Base Resume for direction "${source.application.direction}". Import one before generating documents.`,
    )
  const eligible = generationEligibleRequirements(source.requirements)
  const excludedSkills = source.requirements
    .filter((item) => !isGenerationEligible(item))
    .map((item) => item.skillName)
  return {
    version: 2,
    generatedAt: todayISO(),
    kind: 'application',
    direction: source.application.direction,
    targetTitles: directionTargetTitles(source.application.direction, executor),
    baseResume,
    application: {
      id: source.application.id,
      jobTitle: source.application.jobTitle,
      company: source.company.name,
      location: source.application.location,
      url: source.application.url,
    },
    jobPosting: source.jobPosting
      ? { contentHash: source.jobPosting.contentHash, rawText: source.jobPosting.rawText }
      : null,
    jobRequirements: source.jobRequirements.map((item) => ({
      sequence: item.sequence,
      type: item.requirementType,
      importance: item.importance,
      basis: item.basis,
      statement: item.statement,
      sourceText: item.sourceText,
    })),
    requirements: eligible.map((item) => ({
      skillName: item.skillName,
      importance: item.importance,
      analysisResult: item.analysisResult,
      decision: item.decision,
      decisionReason: item.decisionReason ?? null,
      rawLabel: item.rawLabel ?? null,
      sourceText: item.requirementStatement ?? null,
    })),
    excludedSkills: [...new Set(excludedSkills)],
    documentPolicy: directionDocumentPolicy(source.application.direction, executor),
    careerData: safeCareerData(data),
  }
}

type BaselineRunLike = {
  direction: string
  targetTitle: string
}

export function buildBaselineDocumentDraftSnapshot(
  run: BaselineRunLike,
  executor: DbExecutor = db,
): DocumentDraftSnapshot {
  const data = loadCareerData(executor)
  const baseResume = baseResumeSourceFor(run.direction, executor)
  if (!baseResume) throw new Error(`No approved Base Resume for direction "${run.direction}".`)
  const configured = directionTargetTitles(run.direction, executor)
  return {
    version: 2,
    generatedAt: todayISO(),
    kind: 'baseline',
    direction: run.direction,
    targetTitles: configured.length ? configured : run.targetTitle ? [run.targetTitle] : [],
    baseResume,
    application: null,
    jobPosting: null,
    jobRequirements: [],
    requirements: [],
    excludedSkills: [],
    documentPolicy: directionDocumentPolicy(run.direction, executor),
    careerData: safeCareerData(data),
  }
}

export function documentDraftSnapshotHash(snapshot: DocumentDraftSnapshot): string {
  return canonicalHash(snapshot)
}
