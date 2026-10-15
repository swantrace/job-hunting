import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerAchievementRecord,
  CareerExperienceRecord,
  CareerPublicationRecord,
} from '../../../src/db/career-records'
import { AchievementList } from './AchievementList'

/**
 * Achievements tab: the editor region sits outside the list root so a save keeps
 * the open form while the list refreshes out of band, and retire returns the
 * list fragment only.
 */
export function AchievementSection({
  achievements,
  includeRetired,
  experiences,
  catalogSkills,
  publications,
  directions,
}: {
  achievements: CareerAchievementRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  catalogSkills: CareerCatalogSkill[]
  publications: CareerPublicationRecord[]
  directions: CareerDirectionRecord[]
}) {
  return (
    <div class="space-y-4">
      <div id="career-achievements-editor" aria-live="polite"></div>
      <AchievementList
        achievements={achievements}
        includeRetired={includeRetired}
        experiences={experiences}
        catalogSkills={catalogSkills}
        publications={publications}
        directions={directions}
      />
    </div>
  )
}
