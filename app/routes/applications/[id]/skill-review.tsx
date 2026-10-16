import { createRoute } from 'honox/factory'
import { loadReviewData } from '../../../../src/db/review-data'
import { getApplicationReadiness } from '../../../../src/lib/applications/readiness'
import { canonicalHash } from '../../../../src/lib/canonical-hash'
import { careerSkillEvidenceMap } from '../../../../src/lib/career/canonical-data'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { skillCategoryDefinitions } from '../../../../src/lib/skills/taxonomy'
import { computeWorkspaceAvailability } from '../../../../src/lib/workspace/availability'
import { tabAvailability } from '../../../../src/lib/workspace/state'
import { ReviewReadiness } from '../../../components/workspace/ReviewReadiness'
import { SkillReviewPanel } from '../../../components/workspace/SkillReviewPanel'
import { WorkspaceTabs } from '../../../components/workspace/WorkspaceTabs'

export default createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const review = id ? loadReviewData(id) : null
  if (!review?.job) return c.text('Application not found.', 404)
  if (c.req.query('probe') === '1')
    return c.json({
      revision: canonicalHash({ requirements: review.requirementSkills, mapping: review.mapping }),
    })
  return c.html(
    <>
      <SkillReviewPanel
        job={review.job}
        filters={parseFilters(c)}
        requirements={review.requirementSkills}
        careerEvidence={careerSkillEvidenceMap()}
        mapping={review.mapping}
        categories={skillCategoryDefinitions()}
        canMap={review.jobAnalysisCurrent}
        canDecide={!!review.state.currentCompleted}
      />
      <WorkspaceTabs
        activeTab="review"
        availability={tabAvailability(computeWorkspaceAvailability(id!))}
        oob
      />
      <ReviewReadiness
        jobId={id!}
        filters={parseFilters(c)}
        readiness={getApplicationReadiness(id!)}
        oob
      />
    </>,
  )
})
