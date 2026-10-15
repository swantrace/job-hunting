import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerAchievements,
  updateCareerAchievement,
} from '../../../../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-shared'
import { db } from '../../../../../src/db/client'
import {
  achievementFormSchema,
  achievementFormValues,
  achievementInput,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import {
  AchievementForm,
  achievementFormRootId,
} from '../../../../components/career/AchievementForm'
import { AchievementList } from '../../../../components/career/AchievementList'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findAchievement(id: number | null) {
  return id === null
    ? undefined
    : listCareerAchievements(db, { includeRetired: true }).find((row) => row.id === id)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findAchievement(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <AchievementForm
      values={achievementFormValues(record)}
      recordId={record.id}
      stableKey={record.stableKey}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      directions={view.referenceDirections}
      publications={view.referencePublications}
      catalogSkills={view.catalogSkills}
    />,
  )
})

/**
 * Updates one achievement with the revision the form was rendered with, so a
 * stale submit is a 409 fragment (with a reload action) instead of a lost
 * update. The stable key is taken from the stored record and cannot change.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findAchievement(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = achievementFormRootId(record.id)
  const fallback = achievementFormValues(record)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <AchievementForm
        values={submitted}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
        feedback={feedback}
        experiences={view.referenceExperiences}
        directions={view.referenceDirections}
        publications={view.referencePublications}
        catalogSkills={view.catalogSkills}
      />,
      status,
    )

  const parsed = achievementFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerAchievement(
      db,
      record.id,
      achievementInput(parsed.data, { stableKey: record.stableKey }),
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

  const refreshed = loadCareerDataView(db, { includeRetired })
  const updated = refreshed.achievements.find((row) => row.id === record.id) ?? record
  return c.html(
    <>
      <AchievementForm
        values={achievementFormValues(updated)}
        recordId={updated.id}
        stableKey={updated.stableKey}
        includeRetired={includeRetired}
        experiences={refreshed.referenceExperiences}
        directions={refreshed.referenceDirections}
        publications={refreshed.referencePublications}
        catalogSkills={refreshed.catalogSkills}
      />
      <AchievementList
        achievements={refreshed.achievements}
        includeRetired={includeRetired}
        experiences={refreshed.allExperiences}
        catalogSkills={refreshed.catalogSkills}
        publications={refreshed.allPublications}
        directions={refreshed.allDirections}
        oob
      />
      <CareerDataTabs activeTab="achievements" oob />
      <FlashMessage autoDismiss>Achievement saved.</FlashMessage>
    </>,
  )
})
