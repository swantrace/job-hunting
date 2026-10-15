import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerSkills,
  restoreCareerSkill,
  retireCareerSkill,
} from '../../../../../src/db/career-skills'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { PersonalSkillList } from '../../../../components/career/PersonalSkillList'

/**
 * Retire/restore one personal skill (never delete it). Retirement preserves the
 * history and removes the skill from new documents, because a retired skill is
 * not resume-eligible. This returns the list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerSkills(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerSkill(db, record.id)
  else if (action === 'restore') restoreCareerSkill(db, record.id)
  else return c.text('Unsupported action.', 400)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PersonalSkillList personalSkills={view.personalSkills} includeRetired={includeRetired} />,
  )
})
