import { createRoute } from 'honox/factory'
import { db } from '../../../../../src/db/client'
import {
  loadMentionContext,
  searchApprovedCatalog,
} from '../../../../../src/db/skill-mapping-service'
import { parseId } from '../../../../../src/lib/request'
import { SkillCatalogSelect } from '../../../../components/workspace/SkillSearchSelect'

/**
 * Bounded selector search. Returns only the catalog `<select>` fragment: no
 * AppShell, no sidebar, and never the whole catalog.
 *
 * Every id is re-validated against the database and the URL's application: a
 * forged, missing or foreign `mentionId` yields an empty, disabled list rather
 * than another application's catalog data.
 */
export default createRoute((c) => {
  const jobId = parseId(c.req.param('id'))
  const mentionId = parseId(c.req.query('mentionId'))
  const context = mentionId ? loadMentionContext(mentionId) : null
  if (!jobId || !context || context.jobApplicationId !== jobId) {
    return c.html(
      <SkillCatalogSelect mentionId={mentionId ?? 0} rawTerm="" results={[]} disabled />,
    )
  }
  return c.html(
    <SkillCatalogSelect
      mentionId={context.mentionId}
      rawTerm={context.rawTerm}
      results={searchApprovedCatalog(db, c.req.query('q') ?? '')}
    />,
  )
})
