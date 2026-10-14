import type { CareerEducationRecord } from '../../../src/db/career-records'
import { EducationList } from './EducationList'

/**
 * Education tab: editor region outside the list root, so a save keeps the open
 * form while the list refreshes out of band.
 */
export function EducationSection({
  education,
  includeRetired,
}: {
  education: CareerEducationRecord[]
  includeRetired: boolean
}) {
  return (
    <div class="space-y-4">
      <div id="career-education-editor" aria-live="polite"></div>
      <EducationList education={education} includeRetired={includeRetired} />
    </div>
  )
}
