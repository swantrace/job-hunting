import { createRoute } from 'honox/factory'
import { listCareerExperiences, updateCareerExperience } from '../../../../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-state'
import { db } from '../../../../../src/db/client'
import {
  experienceFormSchema,
  experienceFormValues,
  experienceInput,
  parseExtensionLines,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import { ExperienceForm, experienceFormRootId } from '../../../../components/career/ExperienceForm'
import { ExperienceList } from '../../../../components/career/ExperienceList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findExperience(id: number | null) {
  return id === null
    ? undefined
    : listCareerExperiences(db, { includeRetired: true }).find((row) => row.id === id)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findExperience(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <ExperienceForm
      values={experienceFormValues(record, record.extension)}
      recordId={record.id}
      stableKey={record.stableKey}
      includeRetired={includeRetired}
    />,
  )
})

/**
 * Updates one experience with the revision the form was rendered with, so a
 * stale submit is a 409 fragment (with a reload action) instead of a lost
 * update. The stable key is taken from the stored record and cannot change.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findExperience(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const rootId = experienceFormRootId(record.id)
  const fallback = experienceFormValues(record, record.extension)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <ExperienceForm
        values={submitted}
        recordId={record.id}
        stableKey={record.stableKey}
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
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerExperience(
      db,
      record.id,
      experienceInput(parsed.data, {
        stableKey: record.stableKey,
        extension: parseExtensionLines(record.extension, parsed.data.extensionFields),
      }),
      { expectedRevision: parsed.data.expectedRevision },
    )
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

  const updated = findExperience(record.id) ?? record
  return c.html(
    <>
      <ExperienceForm
        values={experienceFormValues(updated, updated.extension)}
        recordId={updated.id}
        stableKey={updated.stableKey}
        includeRetired={includeRetired}
      />
      <ExperienceList
        experiences={listCareerExperiences(db, { includeRetired })}
        includeRetired={includeRetired}
        oob
      />
      <CareerDataTabs activeTab="experience" oob />
      <FlashMessage autoDismiss>Experience saved.</FlashMessage>
    </>,
  )
})
