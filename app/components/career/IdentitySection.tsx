import type { CareerCandidateRecord } from '../../../src/db/career-facts'
import { IdentityPanel } from './IdentityPanel'

/**
 * Identity tab: the editor region first (so an opened form is announced and
 * focused) followed by the read-only summary the save updates out of band.
 */
export function IdentitySection({
  candidate,
  extensions,
}: {
  candidate: CareerCandidateRecord | null
  extensions: Record<string, unknown> | null
}) {
  return (
    <div class="space-y-4">
      <div id="career-identity-editor" aria-live="polite"></div>
      <IdentityPanel candidate={candidate} extensions={extensions} />
    </div>
  )
}
