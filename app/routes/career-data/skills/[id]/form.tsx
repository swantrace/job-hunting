import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import { listCareerSkills, updateCareerSkill } from '../../../../../src/db/career-skills'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-state'
import { db } from '../../../../../src/db/client'
import {
  personalSkillFormSchema,
  personalSkillFormValues,
  personalSkillUpdateInput,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import {
  PersonalSkillForm,
  personalSkillFormRootId,
} from '../../../../components/career/PersonalSkillForm'
import { PersonalSkillList } from '../../../../components/career/PersonalSkillList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findPersonalSkill(id: number | null) {
  return id === null
    ? undefined
    : listCareerSkills(db, { includeRetired: true }).find((row) => row.id === id)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findPersonalSkill(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PersonalSkillForm
      values={personalSkillFormValues(record)}
      recordId={record.id}
      includeRetired={includeRetired}
      catalogSkills={view.catalogSkills}
      linkedSkill={{ id: record.skillId, name: record.skillName, key: record.skillKey }}
    />,
  )
})

/**
 * Updates one personal skill with the revision the form was rendered with, so a
 * stale submit is a 409 fragment (with a reload action) instead of a lost
 * update. The catalog entry is the identity and is taken from the stored record.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findPersonalSkill(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = personalSkillFormRootId(record.id)
  const fallback = personalSkillFormValues(record)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const linkedSkill = { id: record.skillId, name: record.skillName, key: record.skillKey }
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <PersonalSkillForm
        values={submitted}
        recordId={record.id}
        includeRetired={includeRetired}
        feedback={feedback}
        catalogSkills={view.catalogSkills}
        linkedSkill={linkedSkill}
      />,
      status,
    )

  const parsed = personalSkillFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerSkill(db, record.id, personalSkillUpdateInput(parsed.data), {
      expectedRevision: parsed.data.expectedRevision,
    })
  } catch (error) {
    if (error instanceof CareerRevisionConflictError) {
      retargetFragment(c, rootId)
      return render({ conflict: true }, 409)
    }
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const updated = refreshed.personalSkills.find((row) => row.id === record.id)
  return c.html(
    <>
      <PersonalSkillForm
        values={personalSkillFormValues(updated ?? record)}
        recordId={record.id}
        includeRetired={includeRetired}
        catalogSkills={refreshed.catalogSkills}
        linkedSkill={linkedSkill}
      />
      <PersonalSkillList
        personalSkills={refreshed.personalSkills}
        includeRetired={includeRetired}
        oob
      />
      <CareerDataTabs activeTab="skills" oob />
      <FlashMessage autoDismiss>Personal skill saved.</FlashMessage>
    </>,
  )
})
