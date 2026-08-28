import { createRoute } from 'honox/factory'
import type { Filters } from '../../../../src/db/queries'
import { getApplication, type JobCardData } from '../../../../src/db/queries'
import {
  getApplicationSkillRequirement,
  listApplicationSkillRequirements,
  skipRemainingSkillDecisions,
  updateSkillDecision,
} from '../../../../src/db/skill-queries'
import { careerSkillEvidenceMap } from '../../../../src/lib/career-data'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { skillDecisionSchema } from '../../../../src/lib/validation'
import { SkillDecisionForm, SkillGapPanel } from '../../../components/workspace/SkillGapPanel'

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

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  const raw = await parseForm(c)
  if (raw.action === 'skip-remaining') {
    skipRemainingSkillDecisions(id)
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

  updateSkillDecision(id, skillId, parsed.data.action, parsed.data.reason.trim() || null)
  return c.html(reviewPanel(job, filters, id))
})
