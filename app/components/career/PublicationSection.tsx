import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerExperienceRecord,
  CareerProjectRecord,
  CareerPublicationRecord,
} from '../../../src/db/career-records'
import { PublicationList } from './PublicationList'

/**
 * Publications tab: the editor region sits outside the list root so a save keeps
 * the open form while the list refreshes out of band, and retire returns the
 * list fragment only.
 */
export function PublicationSection({
  publications,
  includeRetired,
  experiences,
  projects,
  directions,
}: {
  publications: CareerPublicationRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  projects: CareerProjectRecord[]
  directions: CareerDirectionRecord[]
}) {
  return (
    <div class="space-y-4">
      <div id="career-publications-editor" aria-live="polite"></div>
      <PublicationList
        publications={publications}
        includeRetired={includeRetired}
        experiences={experiences}
        projects={projects}
        directions={directions}
      />
    </div>
  )
}
