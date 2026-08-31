import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import type { Filters } from '../../../src/db/queries'
import { parseCandidateFitResult } from '../../../src/lib/evidence/status'
import type { ProfileOption } from '../../../src/lib/profiles'
import { query } from './helpers'

export function ProfileRecommendation({
  jobId,
  filters,
  run,
  profiles,
  oob = false,
  canConfirm = true,
}: {
  jobId: number
  filters: Filters
  run: ApplicationAnalysisRun | null
  profiles: ProfileOption[]
  oob?: boolean
  canConfirm?: boolean
}) {
  const result = parseCandidateFitResult(run?.resultJson)
  const recommendation = result?.profileRecommendation ?? null
  const confirmedProfileId = run?.confirmedProfileId ?? null
  const label = (id: string) => profiles.find((profile) => profile.id === id)?.label ?? id

  return (
    <section
      id="profile-recommendation"
      class="rounded-box border border-base-300 p-4"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <h3 class="font-semibold">Generation profile</h3>
      {confirmedProfileId ? (
        <div class="mt-3">
          <span class="badge badge-success">Confirmed</span>
          {!canConfirm ? <span class="badge badge-warning badge-sm">Outdated</span> : null}
          <p class="mt-2 text-sm">
            Using <strong>{label(confirmedProfileId)}</strong> for document generation.
          </p>
          {run?.profileConfirmedAt ? (
            <p class="text-xs text-base-content/60">Confirmed {run.profileConfirmedAt}</p>
          ) : null}
        </div>
      ) : recommendation ? (
        <div class="mt-3 space-y-3">
          <div class="alert alert-info text-sm" role="status">
            <span>
              AI recommendation: <strong>{label(recommendation.recommendedProfileId)}</strong>.{' '}
              {recommendation.rationale}
            </span>
          </div>
          {recommendation.alternatives.length > 0 && (
            <div class="space-y-1 text-sm">
              {recommendation.alternatives.map((alternative) => (
                <p class="text-base-content/70">
                  <span class="badge badge-outline badge-sm">{label(alternative.profileId)}</span>{' '}
                  {alternative.rationale}
                </p>
              ))}
            </div>
          )}
          <form
            class="flex flex-wrap items-end gap-3"
            hx-post={`/applications/${jobId}/profile-selection?${query(filters)}`}
            hx-target="#profile-recommendation"
            hx-swap="outerHTML"
            hx-disabled-elt="find button"
          >
            <input type="hidden" name="runId" value={run?.id ?? ''} />
            <label class="fieldset">
              <legend class="fieldset-legend">Confirm generation profile</legend>
              <select class="select" name="profileId" disabled={!canConfirm}>
                {profiles.map((profile) => (
                  <option
                    value={profile.id}
                    selected={profile.id === recommendation.recommendedProfileId}
                  >
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <button class="btn btn-secondary" disabled={!canConfirm}>
              <span class="loading loading-spinner loading-xs htmx-indicator" /> Confirm
            </button>
          </form>
          {!canConfirm ? (
            <p class="text-xs text-base-content/60">
              Re-run candidate analysis before confirming a profile.
            </p>
          ) : null}
        </div>
      ) : (
        <p class="mt-3 text-sm text-base-content/60">
          No profile recommendation is available. Run candidate analysis first.
        </p>
      )}
    </section>
  )
}
