import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import { parseCandidateFitResult } from '../../../src/lib/evidence/status'

export function FitRecommendation({
  run,
  oob = false,
}: {
  run: ApplicationAnalysisRun | null
  oob?: boolean
}) {
  const result = parseCandidateFitResult(run?.resultJson)
  if (!result) {
    return (
      <section
        id="fit-recommendation"
        class="rounded-box border border-base-300 p-4"
        {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
      >
        <h3 class="font-semibold">Fit recommendation</h3>
        <p class="mt-2 text-sm text-base-content/60">
          Run candidate analysis to see a labelled recommendation.
        </p>
      </section>
    )
  }
  const badge =
    result.fitRecommendation === 'apply'
      ? 'badge-success'
      : result.fitRecommendation === 'apply-selectively'
        ? 'badge-warning'
        : 'badge-error'
  return (
    <section
      id="fit-recommendation"
      class="rounded-box border border-base-300 p-4"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-semibold">Fit recommendation</h3>
        <span class={`badge ${badge}`}>{result.fitRecommendation}</span>
      </div>
      <p class="mt-2 text-sm text-base-content/70">{result.recommendationRationale}</p>
      <p class="mt-2 text-xs text-base-content/60">AI analysis — not a numeric score.</p>
    </section>
  )
}
