import { desc, eq, inArray } from 'drizzle-orm'
import { parseCandidateFitResult } from '../lib/evidence/status'
import type { SkillDecision } from '../lib/skills/constants'
import { careerSkillMatchResult } from '../lib/skills/runtime-career-skills'
import { db } from './client'
import {
  analysisRunDecisions,
  applicationAnalysisRuns,
  companies,
  jobApplications,
  jobPostingAnalyses,
  jobPostings,
  jobRequirements,
  jobRequirementsToSkills,
  skillAliases,
  skills,
} from './schema'

export type GapDb = Pick<typeof db, 'select'>

export type GapQueueDecision = 'pending' | 'include' | 'skip'

export type CareerDataGap = {
  skillId: number
  skillName: string
  skillKey: string
  category: string | null
  aliases: string[]
  applicationCount: number
  requirementStatements: string[]
  latestApplicationId: number
  latestApplicationTitle: string
  latestCompany: string
  latestDecision: GapQueueDecision
  latestIncludeReason: string | null
  /** True when the current career data now proves the skill (added after analysis). */
  nowEvidenced: boolean
  sources: Array<{ applicationId: number; title: string; company: string }>
}

export type GapQueueFilters = { category?: string; decision?: string }

type GapRun = {
  runId: number
  jobPostingAnalysisId: number
  resultJson: string | null
  applicationId: number
  jobTitle: string
  companyName: string
}

type GapMapping = {
  jobPostingAnalysisId: number
  requirementId: number
  requirementStatement: string
  skillId: number
  skillName: string
  skillKey: string
  category: string | null
}

type GapAccumulator = {
  skillId: number
  skillName: string
  skillKey: string
  category: string | null
  requirementStatements: Set<string>
  applications: Map<number, { applicationId: number; title: string; company: string }>
  runIds: Set<number>
}

function decisionByRunSkill(
  decisions: Array<typeof analysisRunDecisions.$inferSelect>,
): Map<string, SkillDecision> {
  return new Map(
    decisions.map((decision) => [
      `${decision.applicationAnalysisRunId}:${decision.skillId}`,
      decision.decision,
    ]),
  )
}

function reasonByRunSkill(
  decisions: Array<typeof analysisRunDecisions.$inferSelect>,
): Map<string, string | null> {
  return new Map(
    decisions.map((decision) => [
      `${decision.applicationAnalysisRunId}:${decision.skillId}`,
      decision.reason,
    ]),
  )
}

/**
 * Derived read model for the Career Data Gap Queue. Combines the current
 * (latest completed) Candidate Analysis run per application with its run-scoped
 * decisions and the canonical requirement-skill mappings, keeping only
 * requirements whose candidate-fit assessment is `unknown-evidence`. It never
 * writes career data and never invents a second mutable gap table.
 */
export function listCareerDataGaps(
  filters: GapQueueFilters = {},
  executor: GapDb = db,
): CareerDataGap[] {
  const runs = executor
    .select({
      runId: applicationAnalysisRuns.id,
      jobPostingAnalysisId: applicationAnalysisRuns.jobPostingAnalysisId,
      resultJson: applicationAnalysisRuns.resultJson,
      applicationId: jobApplications.id,
      jobTitle: jobApplications.jobTitle,
      companyName: companies.name,
    })
    .from(applicationAnalysisRuns)
    .innerJoin(
      jobPostingAnalyses,
      eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
    )
    .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
    .innerJoin(jobApplications, eq(jobPostings.jobApplicationId, jobApplications.id))
    .innerJoin(companies, eq(jobApplications.companyId, companies.id))
    .where(eq(applicationAnalysisRuns.status, 'Completed'))
    .orderBy(desc(applicationAnalysisRuns.id))
    .all()

  // Latest completed run per application: the current historical lineage.
  const latestByApplication = new Map<number, GapRun>()
  for (const run of runs) {
    if (!latestByApplication.has(run.applicationId)) latestByApplication.set(run.applicationId, run)
  }
  const latestRuns = [...latestByApplication.values()]
  if (!latestRuns.length) return []

  const analysisIds = [...new Set(latestRuns.map((run) => run.jobPostingAnalysisId))]
  const runIds = latestRuns.map((run) => run.runId)

  const mappings = executor
    .select({
      jobPostingAnalysisId: jobRequirements.jobPostingAnalysisId,
      requirementId: jobRequirements.id,
      requirementStatement: jobRequirements.statement,
      skillId: skills.id,
      skillName: skills.name,
      skillKey: skills.key,
      category: skills.category,
    })
    .from(jobRequirements)
    .innerJoin(
      jobRequirementsToSkills,
      eq(jobRequirements.id, jobRequirementsToSkills.jobRequirementId),
    )
    .innerJoin(skills, eq(skills.id, jobRequirementsToSkills.skillId))
    .where(inArray(jobRequirements.jobPostingAnalysisId, analysisIds))
    .all()

  const decisions = executor
    .select()
    .from(analysisRunDecisions)
    .where(inArray(analysisRunDecisions.applicationAnalysisRunId, runIds))
    .all()

  const skillIds = [...new Set(mappings.map((mapping) => mapping.skillId))]
  const aliasRows = skillIds.length
    ? executor.select().from(skillAliases).where(inArray(skillAliases.skillId, skillIds)).all()
    : []

  const runByAnalysis = new Map(latestRuns.map((run) => [run.jobPostingAnalysisId, run]))
  const runById = new Map(latestRuns.map((run) => [run.runId, run]))
  const decisionFor = decisionByRunSkill(decisions)
  const reasonFor = reasonByRunSkill(decisions)
  const aliasesBySkill = new Map<number, string[]>()
  for (const alias of aliasRows) {
    const list = aliasesBySkill.get(alias.skillId) ?? []
    list.push(alias.alias)
    aliasesBySkill.set(alias.skillId, list)
  }

  const assessmentsByRun = new Map<number, Map<number, string>>()
  for (const run of latestRuns) {
    const parsed = parseCandidateFitResult(run.resultJson)
    assessmentsByRun.set(
      run.runId,
      new Map(
        (parsed?.requirementAssessments ?? []).map((assessment) => [
          assessment.jobRequirementId,
          assessment.evidenceStatus,
        ]),
      ),
    )
  }

  const groups = new Map<number, GapAccumulator>()
  for (const mapping of mappings) {
    const run = runByAnalysis.get(mapping.jobPostingAnalysisId)
    if (!run) continue
    const assessments = assessmentsByRun.get(run.runId)
    if (assessments?.get(mapping.requirementId) !== 'unknown-evidence') continue

    const group =
      groups.get(mapping.skillId) ??
      ({
        skillId: mapping.skillId,
        skillName: mapping.skillName,
        skillKey: mapping.skillKey,
        category: mapping.category,
        requirementStatements: new Set<string>(),
        applications: new Map(),
        runIds: new Set<number>(),
      } satisfies GapAccumulator)
    group.requirementStatements.add(mapping.requirementStatement)
    group.applications.set(run.applicationId, {
      applicationId: run.applicationId,
      title: run.jobTitle,
      company: run.companyName,
    })
    group.runIds.add(run.runId)
    groups.set(mapping.skillId, group)
  }

  const rows: CareerDataGap[] = []
  for (const group of groups.values()) {
    const sources = [...group.applications.values()]
    const latestRunId = Math.max(...group.runIds)
    const latestRun = runById.get(latestRunId)
    const decision = decisionFor.get(`${latestRunId}:${group.skillId}`) ?? 'pending'
    const nowEvidenced = careerSkillMatchResult(group.skillKey) === 'proven-match'
    rows.push({
      skillId: group.skillId,
      skillName: group.skillName,
      skillKey: group.skillKey,
      category: group.category,
      aliases: [...(aliasesBySkill.get(group.skillId) ?? [])].sort(),
      applicationCount: group.applications.size,
      requirementStatements: [...group.requirementStatements].sort(),
      latestApplicationId: latestRun?.applicationId ?? sources[0]?.applicationId ?? 0,
      latestApplicationTitle: latestRun?.jobTitle ?? sources[0]?.title ?? '',
      latestCompany: latestRun?.companyName ?? sources[0]?.company ?? '',
      latestDecision: decision === 'include' ? 'include' : decision === 'skip' ? 'skip' : 'pending',
      latestIncludeReason:
        decision === 'include' ? (reasonFor.get(`${latestRunId}:${group.skillId}`) ?? null) : null,
      nowEvidenced,
      sources,
    })
  }

  return rows
    .filter((row) => !filters.category || row.category === filters.category)
    .filter((row) => !filters.decision || row.latestDecision === filters.decision)
    .sort((left, right) => {
      if (left.nowEvidenced !== right.nowEvidenced) return left.nowEvidenced ? 1 : -1
      return left.skillName.toLocaleLowerCase().localeCompare(right.skillName.toLocaleLowerCase())
    })
}
