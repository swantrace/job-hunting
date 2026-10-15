import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import {
  createCareerDirection,
  listCareerDirections,
  readCareerDirection,
} from '../../../../src/db/career-directions'
import { CareerReferenceError } from '../../../../src/db/career-state'
import { db } from '../../../../src/db/client'
import {
  careerStableKey,
  directionFormSchema,
  directionFormValues,
  directionInput,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { DirectionForm, directionFormRootId } from '../../../components/career/DirectionForm'
import { DirectionList } from '../../../components/career/DirectionList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  return c.html(
    <DirectionForm
      values={directionFormValues(null)}
      directionKey={null}
      includeRetired={includeRetired}
    />,
  )
})

/**
 * Creates one direction. The stable key is generated (never typed) and stays the
 * record identity when the label is renamed. A save returns the new edit form
 * plus the refreshed list and tabs as top-level OOB siblings.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const rootId = directionFormRootId(null)
  const fallback = directionFormValues(null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <DirectionForm
        values={submitted}
        directionKey={null}
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

  let createdKey: string
  try {
    createdKey = careerStableKey(
      [parsed.data.label],
      listCareerDirections(db, { includeRetired: true }).map((row) => row.key),
    )
    createCareerDirection(db, directionInput(parsed.data, { key: createdKey }))
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const record = readCareerDirection(db, createdKey)
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <>
      <DirectionForm
        values={directionFormValues(record)}
        directionKey={record.key}
        includeRetired={includeRetired}
      />
      <DirectionList directions={view.directions} includeRetired={includeRetired} oob />
      <CareerDataTabs activeTab="directions" oob />
      <FlashMessage autoDismiss>Direction added.</FlashMessage>
    </>,
  )
})
