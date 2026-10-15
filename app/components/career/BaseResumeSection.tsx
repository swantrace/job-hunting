import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerBaseResume } from '../../../src/db/schema'
import { BaseResumeList } from './BaseResumeList'

/**
 * Base Resumes tab: per direction, the immutable version history and which
 * approved version is currently selected. The editor region sits outside the
 * list root so a draft save keeps the open form while the list refreshes out of
 * band, and approve/supersede return the list fragment only.
 */
export function BaseResumeSection({
  directions,
  versions,
  includeRetired,
}: {
  directions: CareerDirectionRecord[]
  versions: CareerBaseResume[]
  includeRetired: boolean
}) {
  return (
    <div class="space-y-4">
      <div id="career-base-resumes-editor" aria-live="polite"></div>
      <BaseResumeList directions={directions} versions={versions} includeRetired={includeRetired} />
    </div>
  )
}
