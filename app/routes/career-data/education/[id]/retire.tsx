import { createRoute } from 'honox/factory'
import {
  listCareerEducation,
  restoreCareerEducation,
  retireCareerEducation,
} from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { EducationList } from '../../../../components/career/EducationList'

/**
 * Retire/restore one education record. Retirement preserves history and removes
 * it from the records new documents can use; it stays visible in "show retired"
 * mode and can be restored. This returns the list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerEducation(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerEducation(db, record.id)
  else if (action === 'restore') restoreCareerEducation(db, record.id)
  else return c.text('Unsupported action.', 400)
  return c.html(
    <EducationList
      education={listCareerEducation(db, { includeRetired })}
      includeRetired={includeRetired}
    />,
  )
})
