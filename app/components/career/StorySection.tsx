import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerExperienceRecord, CareerStoryRecord } from '../../../src/db/career-records'
import { StoryList } from './StoryList'

/**
 * Stories tab: the editor region sits outside the list root so a save keeps the
 * open form while the list refreshes out of band, and retire returns the list
 * fragment only.
 */
export function StorySection({
  stories,
  includeRetired,
  experiences,
  directions,
}: {
  stories: CareerStoryRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  directions: CareerDirectionRecord[]
}) {
  return (
    <div class="space-y-4">
      <div id="career-stories-editor" aria-live="polite"></div>
      <StoryList
        stories={stories}
        includeRetired={includeRetired}
        experiences={experiences}
        directions={directions}
      />
    </div>
  )
}
