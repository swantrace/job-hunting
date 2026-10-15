import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import { readCareerDirection, updateCareerDirection } from '../../../../../src/db/career-directions'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-shared'
import { db } from '../../../../../src/db/client'
import {
  directionFormSchema,
  directionFormValues,
  directionInput,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import { DirectionForm, directionFormRootId } from '../../../../components/career/DirectionForm'
import { DirectionList } from '../../../../components/career/DirectionList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = readCareerDirection(db, c.req.param('key') ?? '')
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <DirectionForm
      values={directionFormValues(record)}
      directionKey={record.key}
      includeRetired={includeRetired}
    />,
  )
})

/**
 * Updates one direction with the revision the form was rendered with, so a stale
 * submit is a 409 fragment (with a reload action) instead of a lost update. The
 * stable key is taken from the stored record and cannot change.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = readCareerDirection(db, c.req.param('key') ?? '')
  if (!record) return c.text('Not found.', 404)
  const rootId = directionFormRootId(record.key)
  const fallback = directionFormValues(record)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <DirectionForm
        values={submitted}
        directionKey={record.key}
        includeRetired={includeRetired}
        feedback={feedback}
      />,
      status,
    )

  const parsed = directionFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  const input = directionInput(parsed.data, {
    key: record.key,
    currentRules: record.rules,
  })
  try {
    updateCareerDirection(
      db,
      record.key,
      {
        label: input.label,
        targetTitles: input.targetTitles,
        rules: input.rules ?? null,
        sortOrder: input.sortOrder,
      },
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

  const updated = readCareerDirection(db, record.key) ?? record
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <>
      <DirectionForm
        values={directionFormValues(updated)}
        directionKey={updated.key}
        includeRetired={includeRetired}
      />
      <DirectionList directions={view.directions} includeRetired={includeRetired} oob />
      <CareerDataTabs activeTab="directions" oob />
      <FlashMessage autoDismiss>Direction saved.</FlashMessage>
    </>,
  )
})
