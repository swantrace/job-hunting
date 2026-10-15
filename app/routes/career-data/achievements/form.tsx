import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { createCareerAchievement, listCareerAchievements } from '../../../../src/db/career-records'
import { CareerReferenceError } from '../../../../src/db/career-shared'
import { db } from '../../../../src/db/client'
import {
  achievementFormSchema,
  achievementFormValues,
  achievementInput,
  careerStableKey,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { AchievementForm, achievementFormRootId } from '../../../components/career/AchievementForm'
import { AchievementList } from '../../../components/career/AchievementList'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <AchievementForm
      values={achievementFormValues(null)}
      recordId={null}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      directions={view.referenceDirections}
      publications={view.referencePublications}
      catalogSkills={view.catalogSkills}
    />,
  )
})

/**
 * Creates one achievement. The stable key is generated (never typed) and stays
 * the record identity when the display fields are renamed. A save returns the
 * new edit form plus the refreshed list and tabs as top-level OOB siblings.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = achievementFormRootId(null)
  const fallback = achievementFormValues(null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <AchievementForm
        values={submitted}
        recordId={null}
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

  let createdId: number
  try {
    const stableKey = careerStableKey(
      [parsed.data.claim],
      listCareerAchievements(db, { includeRetired: true }).map((row) => row.stableKey),
    )
    createdId = createCareerAchievement(db, achievementInput(parsed.data, { stableKey })).id
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const record = refreshed.achievements.find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <AchievementForm
        values={achievementFormValues(record)}
        recordId={record.id}
        stableKey={record.stableKey}
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
      <FlashMessage autoDismiss>Achievement added.</FlashMessage>
    </>,
  )
})
