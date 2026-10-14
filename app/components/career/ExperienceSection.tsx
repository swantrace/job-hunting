import type { CareerExperienceRecord } from '../../../src/db/career-records'
import { ExperienceList } from './ExperienceList'

/**
 * Experience tab: the editor region sits outside the list root so a save can
 * keep the open form while the list refreshes out of band, and retire/order keep
 * swapping only the list fragment.
 */
export function ExperienceSection({
  experiences,
  includeRetired,
}: {
  experiences: CareerExperienceRecord[]
  includeRetired: boolean
}) {
  return (
    <div class="space-y-4">
      <div id="career-experience-editor" aria-live="polite"></div>
      <ExperienceList experiences={experiences} includeRetired={includeRetired} />
    </div>
  )
}
