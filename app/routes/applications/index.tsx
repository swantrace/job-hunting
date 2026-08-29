import { createRoute } from 'honox/factory'
import { createApplication, listApplications, metrics } from '../../../src/db/queries'
import { parseFilters, parseForm } from '../../../src/lib/request'
import {
  parseJobAnalysisValue,
  parseSkillRequirementsValue,
  quickCollectSchema,
} from '../../../src/lib/validation'
import { ApplicationsPage } from '../../components/ApplicationsPage'
import { Board, QuickCollect } from '../../components/Dashboard'
import { MutationResponse } from '../../components/Responses'

export const GET = createRoute((c) => {
  const filters = parseFilters(c)
  // Fragment for HTMX filter swaps; full page for direct navigation/reload.
  if (c.req.header('HX-Request') === 'true')
    return c.html(<Board jobs={listApplications(filters)} filters={filters} />)
  return c.render(<ApplicationsPage filters={filters} />)
})

export const POST = createRoute(async (c) => {
  const filters = parseFilters(c)
  const raw = await parseForm(c)
  const parsed = quickCollectSchema.safeParse(raw)
  if (!parsed.success)
    return c.html(
      <QuickCollect
        filters={filters}
        errors={parsed.error.flatten().fieldErrors}
        values={raw as Record<string, string>}
        skillRequirements={parseSkillRequirementsValue(raw.skillRequirements)}
        jobAnalysis={parseJobAnalysisValue(raw.jobAnalysis)}
      />,
      422,
    )
  // Saving an AI-parsed opportunity only persists the posting, analysis, and
  // requirements. Document generation is explicit and starts from the review.
  createApplication(parsed.data)
  return c.html(
    <MutationResponse
      jobs={listApplications(filters)}
      filters={filters}
      values={metrics()}
      resetQuick
    />,
  )
})
