import { createRoute } from 'honox/factory'
import {
  decideRunSkill,
  skipRemainingRunDecisions,
} from '../../../../src/db/analysis-decision-service'
import type { Filters } from '../../../../src/db/queries'
import { getApplication, type JobCardData } from '../../../../src/db/queries'
import {
  getApplicationSkillRequirement,
  listApplicationSkillRequirements,
  skipRemainingSkillDecisions,
  updateSkillDecision,
} from '../../../../src/db/skill-queries'
import { getCandidateAnalysisState } from '../../../../src/lib/candidate-analysis'
import { careerSkillEvidenceMap } from '../../../../src/lib/career-data'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { skillDecisionSchema } from '../../../../src/lib/validation'
import { SkillDecisionForm } from '../../../components/workspace/SkillDecisionForm'
import { SkillGapPanel } from '../../../components/workspace/SkillGapPanel'

function reviewPanel(job: JobCardData, filters: Filters, id: number) {
  return (
    <SkillGapPanel
      job={job}
      filters={filters}
      requirements={listApplicationSkillRequirements(id)}
      careerEvidence={careerSkillEvidenceMap()}
    />
  )
}

function currentRunId(id: number) {
  return getCandidateAnalysisState(id).currentCompleted?.id ?? null
}

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  const raw = await parseForm(c)
  const runId = currentRunId(id)
  if (!runId) {
    c.header('HX-Retarget', '#skill-review-panel')
    return c.html(reviewPanel(job, filters, id), 422)
  }
  if (raw.action === 'skip-remaining') {
    skipRemainingSkillDecisions(id)
    if (runId) skipRemainingRunDecisions(runId)
    return c.html(reviewPanel(job, filters, id))
  }

  const skillId = Number(raw.skillId)
  const requirement = getApplicationSkillRequirement(id, skillId)
  if (!Number.isSafeInteger(skillId) || skillId < 1 || !requirement)
    return c.html(<div class="alert alert-error">Skill not found.</div>, 404)

  const parsed = skillDecisionSchema.safeParse(raw)
  if (!parsed.success) {
    c.header('HX-Retarget', `#skill-decision-${skillId}`)
    return c.html(
      <SkillDecisionForm
        job={job}
        filters={filters}
        requirement={requirement}
        error={parsed.error.flatten().fieldErrors.reason?.[0] ?? 'A reason is required.'}
      />,
      422,
    )
  }

  const decision = parsed.data.action
  const reason = parsed.data.reason.trim() || null
  updateSkillDecision(id, skillId, decision, reason)
  if (runId) decideRunSkill({ runId, skillId, decision, reason })
  return c.html(reviewPanel(job, filters, id))
})
