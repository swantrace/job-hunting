import { createRoute } from 'honox/factory'
import { createCareerExperience, listCareerExperiences } from '../../../../src/db/career-records'
import { CareerReferenceError } from '../../../../src/db/career-shared'
import { db } from '../../../../src/db/client'
import {
  careerStableKey,
  experienceFormSchema,
  experienceFormValues,
  experienceInput,
  parseExtensionLines,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { ExperienceForm, experienceFormRootId } from '../../../components/career/ExperienceForm'
import { ExperienceList } from '../../../components/career/ExperienceList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

/** One entry point for every experience, active or retired (history is kept). */
function allExperiences() {
  return listCareerExperiences(db, { includeRetired: true })
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  return c.html(
    <ExperienceForm
      values={experienceFormValues(null, null)}
      recordId={null}
      includeRetired={includeRetired}
    />,
  )
})

/**
 * Creates one experience. The stable key is generated (never typed) and stays
 * the record identity when the display fields are renamed later. A save returns
 * the new edit form plus the refreshed list and tabs as top-level OOB siblings.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const rootId = experienceFormRootId(null)
  const fallback = experienceFormValues(null, null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <ExperienceForm
        values={submitted}
        recordId={null}
        includeRetired={includeRetired}
        feedback={feedback}
      />,
      status,
    )

  const parsed = experienceFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }

  let createdId: number
  try {
    const stableKey = careerStableKey(
      [parsed.data.company, parsed.data.role],
      allExperiences().map((row) => row.stableKey),
    )
    createdId = createCareerExperience(
      db,
      experienceInput(parsed.data, {
        stableKey,
        extension: parseExtensionLines(null, parsed.data.extensionFields),
      }),
    ).id
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const record = allExperiences().find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <ExperienceForm
        values={experienceFormValues(record, record.extension)}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
      />
      <ExperienceList
        experiences={listCareerExperiences(db, { includeRetired })}
        includeRetired={includeRetired}
        oob
      />
      <CareerDataTabs activeTab="experience" oob />
      <FlashMessage autoDismiss>Experience added.</FlashMessage>
    </>,
  )
})
