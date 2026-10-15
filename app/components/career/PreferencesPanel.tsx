import type { CareerPreferencesRecord } from '../../../src/db/career-facts'
import { formatFieldValue } from '../../../src/lib/career/form-input'
import { EmptyState } from '../ui/EmptyState'

/**
 * Read-only preferences summary with the entry point to its editor. It is an
 * HTMX root (`#career-preferences-panel`) so a save refreshes the summary in
 * place without losing the active tab.
 */
export function PreferencesPanel({
  preferences,
  extensions,
  oob = false,
}: {
  preferences: CareerPreferencesRecord | null
  extensions: Record<string, unknown> | null
  oob?: boolean
}) {
  const compensation = preferences?.compensation ?? null
  const compensationText = compensation
    ? [
        compensation.currency ?? null,
        compensation.minimum === null || compensation.minimum === undefined
          ? null
          : `min ${compensation.minimum}`,
        compensation.maximum === null || compensation.maximum === undefined
          ? null
          : `max ${compensation.maximum}`,
      ]
        .filter(Boolean)
        .join(' · ') || 'Recorded without a value'
    : 'Not recorded'
  const extensionEntries = Object.entries(extensions ?? {})
  return (
    <section
      id="career-preferences-panel"
      aria-labelledby="career-preferences-heading"
      class="card border border-base-300 bg-base-100"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="career-preferences-heading" class="text-lg font-semibold">
              Preferences
            </h2>
            <p class="text-sm text-base-content/60">
              Locations, work modes, availability and compensation expectations.
            </p>
          </div>
          <button
            class="btn btn-sm"
            hx-get="/career-data/preferences/form"
            hx-target="#career-preferences-editor"
            hx-swap="innerHTML"
          >
            {preferences ? 'Edit' : 'Add preferences'}
          </button>
        </div>

        {preferences ? (
          <>
            <div>
              <h3 class="text-sm font-semibold">Locations</h3>
              {preferences.locations.length > 0 ? (
                <ul class="list-inside list-disc text-sm">
                  {preferences.locations.map((location) => (
                    <li>{location}</li>
                  ))}
                </ul>
              ) : (
                <p class="text-sm text-base-content/60">None recorded.</p>
              )}
            </div>
            <div>
              <h3 class="text-sm font-semibold">Work modes</h3>
              {preferences.workModes.length > 0 ? (
                <div class="flex flex-wrap gap-1">
                  {preferences.workModes.map((mode) => (
                    <span class="badge badge-outline badge-sm whitespace-nowrap">{mode}</span>
                  ))}
                </div>
              ) : (
                <p class="text-sm text-base-content/60">None recorded.</p>
              )}
            </div>
            <div>
              <h3 class="text-sm font-semibold">Availability</h3>
              <p class="text-sm">{preferences.availability ?? 'Not recorded.'}</p>
            </div>
            <div>
              <h3 class="text-sm font-semibold">Compensation</h3>
              <p class="text-sm">{compensationText}</p>
              {compensation?.notes ? (
                <p class="mt-1 text-sm text-base-content/70">{compensation.notes}</p>
              ) : null}
            </div>
            <div>
              <h3 class="text-sm font-semibold">Notes</h3>
              <p class="text-sm">{preferences.notes ?? 'Not recorded.'}</p>
            </div>
            {extensionEntries.length > 0 ? (
              <div>
                <h3 class="text-sm font-semibold">Preserved extension fields</h3>
                <dl class="grid gap-1 sm:grid-cols-2">
                  {extensionEntries.map(([key, value]) => (
                    <div class="flex gap-2">
                      <dt class="font-mono text-xs">{key}</dt>
                      <dd class="break-all text-xs text-base-content/70">
                        {formatFieldValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No preferences recorded yet"
            description="Add where and how you want to work so directions can be tailored."
          />
        )}
      </div>
    </section>
  )
}
