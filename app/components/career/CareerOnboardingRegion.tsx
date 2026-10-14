import { careerOnboardingGuidance } from '../../../src/lib/application-readiness'

/**
 * Visible onboarding empty state. It appears the moment the career database has
 * no candidate and no direction, and it is an HTMX root of its own so a save can
 * refresh it without a full page load.
 */
export function CareerOnboardingRegion({
  onboardingRequired,
  oob = false,
}: {
  onboardingRequired: boolean
  oob?: boolean
}) {
  return (
    <div id="career-onboarding-notice" {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}>
      {onboardingRequired ? (
        <div
          role="status"
          class="alert alert-info alert-vertical mb-4 items-start sm:alert-horizontal"
        >
          <div>
            <h2 class="font-semibold">Start your career database</h2>
            <p>{careerOnboardingGuidance}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <a class="btn btn-sm btn-primary" href="/career-data?tab=identity">
                Add your details
              </a>
              <a class="btn btn-sm" href="/import">
                Import a career dataset
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
