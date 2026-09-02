import {
  baseResumesDirectory,
  type FrozenBaseResumeSource,
  frozenBaseResumeSource,
  loadApprovedBaseResume,
} from './base-resumes'
import { canonicalHash } from './canonical-hash'
import { type CanonicalCareerData, loadCareerData } from './career-data'
import { todayISO } from './date'
import { directionTargetTitles, listDirections } from './directions'
import {
  generationEligibleRequirements,
  isGenerationEligible,
} from './skills/generation-eligibility'

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
  version: 1
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
  careerData: ReturnType<typeof safeCareerData>
}

export function safeCareerData(data: CanonicalCareerData) {
  return {
    candidate: data.candidate,
    experiences: data.experiences.experiences,
    achievements: data.achievements.achievements.filter((item) => item.safeToUse),
    publications: data.publications.publications.filter((item) => item.safeToUse),
    projects: data.projects.projects,
    skills: data.skills.skills,
    stories: data.stories.stories,
  }
}

function knownDirectionIds() {
  return new Set(listDirections().map((direction) => direction.id))
}

/** Loads the frozen approved Base Resume for a direction, or null when absent. */
export function baseResumeSourceFor(direction: string): FrozenBaseResumeSource | null {
  const resume = loadApprovedBaseResume(baseResumesDirectory(), direction, knownDirectionIds())
  return resume ? frozenBaseResumeSource(resume) : null
}

export function baseResumeIdentity(direction: string): {
  baseResumeHash: string | null
  baseResumeVersion: string | null
} {
  const source = baseResumeSourceFor(direction)
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

export function buildDocumentDraftSnapshot(source: GenerationSourceLike): DocumentDraftSnapshot {
  const data = loadCareerData()
  const baseResume = baseResumeSourceFor(source.application.direction)
  if (!baseResume)
    throw new Error(
      `No approved Base Resume for direction "${source.application.direction}". Import one before generating documents.`,
    )
  const eligible = generationEligibleRequirements(source.requirements)
  const excludedSkills = source.requirements
    .filter((item) => !isGenerationEligible(item))
    .map((item) => item.skillName)
  return {
    version: 1,
    generatedAt: todayISO(),
    kind: 'application',
    direction: source.application.direction,
    targetTitles: directionTargetTitles(source.application.direction),
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
    careerData: safeCareerData(data),
  }
}

type BaselineRunLike = {
  direction: string
  targetTitle: string
}

export function buildBaselineDocumentDraftSnapshot(run: BaselineRunLike): DocumentDraftSnapshot {
  const data = loadCareerData()
  const baseResume = baseResumeSourceFor(run.direction)
  if (!baseResume) throw new Error(`No approved Base Resume for direction "${run.direction}".`)
  const configured = directionTargetTitles(run.direction)
  return {
    version: 1,
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
    careerData: safeCareerData(data),
  }
}

export function documentDraftSnapshotHash(snapshot: DocumentDraftSnapshot): string {
  return canonicalHash(snapshot)
}
