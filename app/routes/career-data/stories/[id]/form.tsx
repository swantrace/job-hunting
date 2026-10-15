import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import { listCareerStories, updateCareerStory } from '../../../../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-state'
import { db } from '../../../../../src/db/client'
import {
  saveRecordExtensions,
  storedRecordExtensions,
} from '../../../../../src/lib/career/extensions'
import {
  storyFormSchema,
  storyFormValues,
  storyInput,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import { StoryForm, storyFormRootId } from '../../../../components/career/StoryForm'
import { StoryList } from '../../../../components/career/StoryList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findStory(id: number | null) {
  return id === null
    ? undefined
    : listCareerStories(db, { includeRetired: true }).find((row) => row.id === id)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findStory(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <StoryForm
      values={storyFormValues(record, storedRecordExtensions(db, 'stories', record.stableKey))}
      recordId={record.id}
      stableKey={record.stableKey}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      directions={view.referenceDirections}
    />,
  )
})

/**
 * Updates one story with the revision the form was rendered with, so a stale
 * submit is a 409 fragment (with a reload action) instead of a lost update. The
 * stable key is taken from the stored record and cannot change.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findStory(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = storyFormRootId(record.id)
  const fallback = storyFormValues(record, storedRecordExtensions(db, 'stories', record.stableKey))
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <StoryForm
        values={submitted}
        recordId={record.id}
        stableKey={record.stableKey}
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
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerStory(db, record.id, storyInput(parsed.data, { stableKey: record.stableKey }), {
      expectedRevision: parsed.data.expectedRevision,
    })
    saveRecordExtensions(db, 'stories', record.stableKey, parsed.data.extensionFields)
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
  const updated = refreshed.stories.find((row) => row.id === record.id) ?? record
  return c.html(
    <>
      <StoryForm
        values={storyFormValues(updated, storedRecordExtensions(db, 'stories', updated.stableKey))}
        recordId={updated.id}
        stableKey={updated.stableKey}
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
      <FlashMessage autoDismiss>Story saved.</FlashMessage>
    </>,
  )
})
