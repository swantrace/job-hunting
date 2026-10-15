import { createRoute } from 'honox/factory'
import { listCareerEducation, updateCareerEducation } from '../../../../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-shared'
import { db } from '../../../../../src/db/client'
import {
  saveRecordExtensions,
  storedRecordExtensions,
} from '../../../../../src/lib/career/extensions'
import {
  educationFormSchema,
  educationFormValues,
  educationInput,
  resolveFieldValue,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import { EducationForm, educationFormRootId } from '../../../../components/career/EducationForm'
import { EducationList } from '../../../../components/career/EducationList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findEducation(id: number | null) {
  return id === null
    ? undefined
    : listCareerEducation(db, { includeRetired: true }).find((row) => row.id === id)
}

function storedExtensions(stableKey: string): Record<string, unknown> | null {
  return storedRecordExtensions(db, 'education', stableKey)
}

/** Preserved extension fields live on the education row, by stable key. */
function saveExtensions(stableKey: string, text: string | undefined): boolean {
  return saveRecordExtensions(db, 'education', stableKey, text)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findEducation(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <EducationForm
      values={educationFormValues(record, record.details, storedExtensions(record.stableKey))}
      recordId={record.id}
      stableKey={record.stableKey}
      includeRetired={includeRetired}
    />,
  )
})

/**
 * Updates one education record with the revision the form was rendered with, so
 * a stale submit is a 409 fragment instead of a lost update. Additional details
 * and the preserved extension fields stay editable together.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findEducation(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const rootId = educationFormRootId(record.id)
  const extensions = storedExtensions(record.stableKey)
  const fallback = educationFormValues(record, record.details, extensions)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <EducationForm
        values={submitted}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
        feedback={feedback}
      />,
      status,
    )

  const parsed = educationFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerEducation(
      db,
      record.id,
      educationInput(parsed.data, {
        stableKey: record.stableKey,
        details: resolveFieldValue(record.details, parsed.data.details),
      }),
      { expectedRevision: parsed.data.expectedRevision },
    )
    saveExtensions(record.stableKey, parsed.data.extensionFields)
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

  const updated = findEducation(record.id) ?? record
  return c.html(
    <>
      <EducationForm
        values={educationFormValues(updated, updated.details, storedExtensions(updated.stableKey))}
        recordId={updated.id}
        stableKey={updated.stableKey}
        includeRetired={includeRetired}
      />
      <EducationList
        education={listCareerEducation(db, { includeRetired })}
        includeRetired={includeRetired}
        oob
      />
      <CareerDataTabs activeTab="education" oob />
      <FlashMessage autoDismiss>Education saved.</FlashMessage>
    </>,
  )
})
