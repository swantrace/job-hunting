import { createRoute } from 'honox/factory'
import { readBaseResumeVersion } from '../../../../../src/db/career-base-resumes'
import { readCareerDirection } from '../../../../../src/db/career-directions'
import { db } from '../../../../../src/db/client'
import { parseId } from '../../../../../src/lib/request'
import { BaseResumePreview } from '../../../../components/career/BaseResumePreview'

/** Read-only preview of one immutable Base Resume version. */
export const GET = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const version = id === null ? null : readBaseResumeVersion(db, id)
  if (!version) return c.text('Not found.', 404)
  const direction = readCareerDirection(db, version.directionKey)
  return c.html(
    <BaseResumePreview
      version={version}
      directionLabel={direction?.label ?? version.directionKey}
    />,
  )
})
