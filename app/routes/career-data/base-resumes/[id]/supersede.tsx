import { createRoute } from 'honox/factory'
import {
  readBaseResumeVersion,
  supersedeBaseResumeVersion,
} from '../../../../../src/db/career-base-resumes'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import { db } from '../../../../../src/db/client'
import { parseId, queryFlag } from '../../../../../src/lib/request'
import { BaseResumeList } from '../../../../components/career/BaseResumeList'

/**
 * Supersedes one version without choosing a replacement. History stays readable
 * and no version is deleted. This returns the list fragment only.
 */
export const POST = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const version = id === null ? null : readBaseResumeVersion(db, id)
  if (!version) return c.text('Not found.', 404)
  supersedeBaseResumeVersion(db, version.id)
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <BaseResumeList
      directions={view.directions}
      versions={view.baseResumes}
      includeRetired={includeRetired}
    />,
  )
})
