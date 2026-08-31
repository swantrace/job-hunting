import { inArray } from 'drizzle-orm'
import { parseStoredCandidateFit } from '../lib/candidate-fit-result'
import { type CareerGrowthInputRow, isActiveApplicationStatus } from '../lib/career-growth'
import { db } from './client'
import * as schema from './schema'

type Executor = Pick<typeof db, 'select'>

/**
 * Derived read-model projection for Career growth. It never writes a mutable
 * table and never mutates private Career Data: it projects active applications,
 * requirements, canonical skills, candidate assessments, and decisions into
 * per-skill opportunity rows, deduplicated and ranked by the pure logic in
 * `src/lib/career-growth.ts`.
 */
export function listCareerGrowthRows(
  options: { direction?: string } = {},
  executor: Executor = db,
): CareerGrowthInputRow[] {
  const applications = executor
    .select()
    .from(schema.jobApplications)
    .all()
    .filter((app) => isActiveApplicationStatus(app.status))
    .filter((app) => !options.direction || app.direction === options.direction)
  if (!applications.length) return []
  const appById = new Map(applications.map((app) => [app.id, app]))

  const postings = executor
    .select()
    .from(schema.jobPostings)
    .where(inArray(schema.jobPostings.jobApplicationId, [...appById.keys()]))
    .all()
  const postingToApp = new Map(postings.map((posting) => [posting.id, posting.jobApplicationId]))
  const postingIds = [...postingToApp.keys()]
  if (!postingIds.length) return []

  const analyses = executor
    .select()
    .from(schema.jobPostingAnalyses)
    .where(inArray(schema.jobPostingAnalyses.jobPostingId, postingIds))
    .all()
    .filter((analysis) => analysis.status === 'Completed')
  // Latest completed analysis per posting.
  const latestAnalysisByPosting = new Map<number, number>()
  for (const analysis of [...analyses].sort((a, b) => b.id - a.id))
    if (!latestAnalysisByPosting.has(analysis.jobPostingId))
      latestAnalysisByPosting.set(analysis.jobPostingId, analysis.id)
  const analysisIds = [...latestAnalysisByPosting.values()]
  if (!analysisIds.length) return []

  const runs = executor
    .select()
    .from(schema.applicationAnalysisRuns)
    .where(inArray(schema.applicationAnalysisRuns.jobPostingAnalysisId, analysisIds))
    .all()
    .filter((run) => run.status === 'Completed')
  const latestRunByAnalysis = new Map<number, number>()
  for (const run of [...runs].sort((a, b) => b.id - a.id))
    if (!latestRunByAnalysis.has(run.jobPostingAnalysisId))
      latestRunByAnalysis.set(run.jobPostingAnalysisId, run.id)
  const runIds = [...latestRunByAnalysis.values()]

  const requirements = executor
    .select()
    .from(schema.jobRequirements)
    .where(inArray(schema.jobRequirements.jobPostingAnalysisId, analysisIds))
    .all()
  const requirementIds = requirements.map((requirement) => requirement.id)

  const mappings = requirementIds.length
    ? executor
        .select()
        .from(schema.jobRequirementsToSkills)
        .where(inArray(schema.jobRequirementsToSkills.jobRequirementId, requirementIds))
        .all()
    : []
  const skillIds = [...new Set(mappings.map((mapping) => mapping.skillId))]
  const skills = skillIds.length
    ? executor.select().from(schema.skills).where(inArray(schema.skills.id, skillIds)).all()
    : []
  const skillById = new Map(skills.map((skill) => [skill.id, skill]))

  const decisions = runIds.length
    ? executor
        .select()
        .from(schema.analysisRunDecisions)
        .where(inArray(schema.analysisRunDecisions.applicationAnalysisRunId, runIds))
        .all()
    : []
  const decisionByRunSkill = new Map(
    decisions.map((decision) => [
      `${decision.applicationAnalysisRunId}:${decision.skillId}`,
      decision,
    ]),
  )

  const assessmentByRun = new Map<number, Map<number, string>>()
  for (const run of runs) {
    const parsed = parseStoredCandidateFit(run.resultJson)
    const byRequirement = new Map<number, string>()
    for (const assessment of parsed?.requirementAssessments ?? [])
      byRequirement.set(assessment.jobRequirementId, assessment.evidenceStatus)
    assessmentByRun.set(run.id, byRequirement)
  }

  type Aggregate = {
    skillKey: string
    skillName: string
    category: string | null
    directions: Set<string>
    applications: Set<number>
    requiredCount: number
    preferredCount: number
    mentionedCount: number
    verifiedEvidenceCount: number
    retainedCount: number
    latestActivityAt: string
  }

  const aggregate = new Map<string, Aggregate>()
  for (const mapping of mappings) {
    const skill = skillById.get(mapping.skillId)
    const requirement = requirements.find((item) => item.id === mapping.jobRequirementId)
    if (!skill || !requirement) continue
    const runId = latestRunByAnalysis.get(requirement.jobPostingAnalysisId)
    if (runId === undefined) continue
    const analysis = analyses.find((item) => item.id === requirement.jobPostingAnalysisId)
    const appId = analysis ? postingToApp.get(analysis.jobPostingId) : undefined
    const app = appId === undefined ? undefined : appById.get(appId)
    if (!app) continue

    const existing =
      aggregate.get(skill.key) ??
      ({
        skillKey: skill.key,
        skillName: skill.name,
        category: skill.category,
        directions: new Set<string>(),
        applications: new Set<number>(),
        requiredCount: 0,
        preferredCount: 0,
        mentionedCount: 0,
        verifiedEvidenceCount: 0,
        retainedCount: 0,
        latestActivityAt: '',
      } satisfies Aggregate)

    existing.directions.add(app.direction)
    existing.applications.add(app.id)
    if (requirement.importance === 'required') existing.requiredCount += 1
    else if (requirement.importance === 'preferred') existing.preferredCount += 1
    else existing.mentionedCount += 1

    const status = assessmentByRun.get(runId)?.get(requirement.id)
    if (status === 'direct' || status === 'transferable') existing.verifiedEvidenceCount += 1
    if (decisionByRunSkill.get(`${runId}:${skill.id}`)?.decision === 'include')
      existing.retainedCount += 1
    if (app.updatedAt > existing.latestActivityAt) existing.latestActivityAt = app.updatedAt
    aggregate.set(skill.key, existing)
  }

  return [...aggregate.values()].map((row) => ({
    skillKey: row.skillKey,
    skillName: row.skillName,
    category: row.category,
    directionCount: row.directions.size,
    activeApplicationCount: row.applications.size,
    requiredCount: row.requiredCount,
    preferredCount: row.preferredCount,
    mentionedCount: row.mentionedCount,
    verifiedEvidenceCount: row.verifiedEvidenceCount,
    retainedCount: row.retainedCount,
    latestActivityAt: row.latestActivityAt,
  }))
}
