import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { createCareerSkill } from '../../../../src/db/career-skills'
import { CareerReferenceError } from '../../../../src/db/career-state'
import { db } from '../../../../src/db/client'
import {
  personalSkillFormSchema,
  personalSkillFormValues,
  personalSkillInput,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import {
  PersonalSkillForm,
  personalSkillFormRootId,
} from '../../../components/career/PersonalSkillForm'
import { PersonalSkillList } from '../../../components/career/PersonalSkillList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PersonalSkillForm
      values={personalSkillFormValues(null)}
      recordId={null}
      includeRetired={includeRetired}
      catalogSkills={view.catalogSkills}
    />,
  )
})

/**
 * Creates one personal skill from an existing approved catalog entry. It never
 * creates a catalog entry, and it never invents evidence: the candidate supplies
 * the level, eligibility, explanation, notes and evidence.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = personalSkillFormRootId(null)
  const fallback = personalSkillFormValues(null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <PersonalSkillForm
        values={submitted}
        recordId={null}
        includeRetired={includeRetired}
        feedback={feedback}
        catalogSkills={view.catalogSkills}
      />,
      status,
    )

  const parsed = personalSkillFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }

  let createdId: number
  try {
    createdId = createCareerSkill(db, personalSkillInput(parsed.data)).id
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const record = refreshed.personalSkills.find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <PersonalSkillForm
        values={personalSkillFormValues(record)}
        recordId={record.id}
        includeRetired={includeRetired}
        catalogSkills={refreshed.catalogSkills}
        linkedSkill={{ id: record.skillId, name: record.skillName, key: record.skillKey }}
      />
      <PersonalSkillList
        personalSkills={refreshed.personalSkills}
        includeRetired={includeRetired}
        oob
      />
      <CareerDataTabs activeTab="skills" oob />
      <FlashMessage autoDismiss>Personal skill added.</FlashMessage>
    </>,
  )
})
