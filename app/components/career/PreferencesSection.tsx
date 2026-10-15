import type { CareerPreferencesRecord } from '../../../src/db/career-facts'
import { PreferencesPanel } from './PreferencesPanel'

/**
 * Preferences tab: the editor region first (so an opened form is announced and
 * focused) followed by the read-only summary the save updates out of band.
 */
export function PreferencesSection({
  preferences,
  extensions,
}: {
  preferences: CareerPreferencesRecord | null
  extensions: Record<string, unknown> | null
}) {
  return (
    <div class="space-y-4">
      <div id="career-preferences-editor" aria-live="polite"></div>
      <PreferencesPanel preferences={preferences} extensions={extensions} />
    </div>
  )
}
