import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import { DirectionList } from './DirectionList'

/**
 * Directions tab: the editor region sits outside the list root so a save keeps
 * the open form while the list refreshes out of band, and retire/restore
 * returns the list fragment only.
 */
export function DirectionsSection({
  directions,
  includeRetired,
}: {
  directions: CareerDirectionRecord[]
  includeRetired: boolean
}) {
  return (
    <div class="space-y-4">
      <div id="career-directions-editor" aria-live="polite"></div>
      <DirectionList directions={directions} includeRetired={includeRetired} />
    </div>
  )
}
