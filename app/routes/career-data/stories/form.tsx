import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { createCareerStory, listCareerStories } from '../../../../src/db/career-records'
import { CareerReferenceError } from '../../../../src/db/career-state'
import { db } from '../../../../src/db/client'
import { saveRecordExtensions, storedRecordExtensions } from '../../../../src/lib/career/extensions'
import {
  careerStableKey,
  storyFormSchema,
  storyFormValues,
  storyInput,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { StoryForm, storyFormRootId } from '../../../components/career/StoryForm'
import { StoryList } from '../../../components/career/StoryList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <StoryForm
      values={storyFormValues(null, null)}
      recordId={null}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      directions={view.referenceDirections}
    />,
  )
})

/**
 * Creates one story. The stable key is generated (never typed) and stays the
 * record identity when the title is renamed. A save returns the new edit form
 * plus the refreshed list and tabs as top-level OOB siblings.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = storyFormRootId(null)
  const fallback = storyFormValues(null, null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <StoryForm
        values={submitted}
        recordId={null}
        includeRetired={includeRetired}
        feedback={feedback}
        experiences={view.referenceExperiences}
        directions={view.referenceDirections}
      />,
      status,
    )

  const parsed = storyFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }

  let createdId: number
  let stableKey: string
  try {
    stableKey = careerStableKey(
      [parsed.data.title],
      listCareerStories(db, { includeRetired: true }).map((row) => row.stableKey),
    )
    createdId = createCareerStory(db, storyInput(parsed.data, { stableKey })).id
    saveRecordExtensions(db, 'stories', stableKey, parsed.data.extensionFields)
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const record = refreshed.stories.find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <StoryForm
        values={storyFormValues(record, storedRecordExtensions(db, 'stories', record.stableKey))}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
        experiences={refreshed.referenceExperiences}
        directions={refreshed.referenceDirections}
      />
      <StoryList
        stories={refreshed.stories}
        includeRetired={includeRetired}
        experiences={refreshed.allExperiences}
        directions={refreshed.allDirections}
        oob
      />
      <CareerDataTabs activeTab="stories" oob />
      <FlashMessage autoDismiss>Story added.</FlashMessage>
    </>,
  )
})
