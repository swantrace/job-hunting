import type { Child } from 'hono/jsx'
import type { CareerCandidateRecord } from '../../../src/db/career-facts'
import { formatFieldValue } from '../../../src/lib/career/form-input'
import { truthfulnessView } from '../../../src/lib/career/json-schemas'
import { EmptyState } from '../ui/EmptyState'
import { httpUrl } from './helpers'

function linkOrText(value: string | null) {
  const url = httpUrl(value)
  if (!url) return value ?? '—'
  return (
    <a class="link break-all" href={url} target="_blank" rel="noreferrer">
      {value}
    </a>
  )
}

function sponsorshipLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Sponsorship required'
  if (value === false) return 'No sponsorship required'
  return 'Sponsorship not recorded'
}

function ruleState(value: boolean | undefined): string {
  return value ? 'On' : 'Off'
}

/**
 * Read-only identity summary with the entry point to its editor. It is an HTMX
 * root (`#career-identity-panel`) so a save refreshes the summary in place.
 */
export function IdentityPanel({
  candidate,
  extensions,
  oob = false,
}: {
  candidate: CareerCandidateRecord | null
  extensions: Record<string, unknown> | null
  oob?: boolean
}) {
  const truthfulness = truthfulnessView(candidate?.truthfulness)
  const contact: Array<[string, Child]> = candidate
    ? [
        ['Full name', candidate.fullName],
        [
          'Email',
          candidate.email ? (
            <a class="link break-all" href={`mailto:${candidate.email}`}>
              {candidate.email}
            </a>
          ) : (
            '—'
          ),
        ],
        ['Phone', candidate.phone ?? '—'],
        ['Location', candidate.location ?? '—'],
        ['Website', linkOrText(candidate.website)],
        ['LinkedIn', linkOrText(candidate.linkedinUrl)],
        ['GitHub', linkOrText(candidate.githubUrl)],
      ]
    : []
  const extensionEntries = Object.entries(extensions ?? {})
  return (
    <section
      id="career-identity-panel"
      aria-labelledby="career-identity-heading"
      class="card border border-base-300 bg-base-100"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="card-body gap-4 p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="career-identity-heading" class="text-lg font-semibold">
              Identity
            </h2>
            <p class="text-sm text-base-content/60">
              Contact details, work authorization, career break and truthfulness rules.
            </p>
          </div>
          <button
            class="btn btn-sm"
            hx-get="/career-data/identity/form"
            hx-target="#career-identity-editor"
            hx-swap="innerHTML"
          >
            {candidate ? 'Edit' : 'Add identity'}
          </button>
        </div>

        {candidate ? (
          <>
            <dl class="grid gap-3 sm:grid-cols-2">
              {contact.map(([label, value]) => (
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-wider text-base-content/50">
                    {label}
                  </dt>
                  <dd class="break-words">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h3 class="text-sm font-semibold">Work authorization</h3>
              <p class="text-sm">{candidate.authorization?.workAuthorization ?? 'Not recorded.'}</p>
              <div class="mt-1 flex flex-wrap gap-1">
                <span class="badge badge-outline badge-sm whitespace-nowrap">
                  {sponsorshipLabel(candidate.authorization?.requiresSponsorship)}
                </span>
              </div>
              {candidate.authorization?.notes ? (
                <p class="mt-1 text-sm text-base-content/70">{candidate.authorization.notes}</p>
              ) : null}
            </div>

            <div>
              <h3 class="text-sm font-semibold">Career break</h3>
              {candidate.careerBreak ? (
                <div class="flex flex-wrap items-center gap-1">
                  <span class="badge badge-outline badge-sm whitespace-nowrap">
                    {candidate.careerBreak.hasBreak ? 'Has a career break' : 'No career break'}
                  </span>
                  {candidate.careerBreak.hasBreak ? (
                    <span class="badge badge-ghost badge-sm whitespace-nowrap">
                      {[candidate.careerBreak.startDate, candidate.careerBreak.endDate]
                        .filter(Boolean)
                        .join(' – ') || 'Dates not recorded'}{' '}
                      ({candidate.careerBreak.datePrecision} precision)
                    </span>
                  ) : null}
                </div>
              ) : (
                <p class="text-sm text-base-content/60">Not recorded.</p>
              )}
              {candidate.careerBreak?.reason ? (
                <p class="mt-1 text-sm text-base-content/70">{candidate.careerBreak.reason}</p>
              ) : null}
            </div>

            <div>
              <h3 class="text-sm font-semibold">Truthfulness rules</h3>
              {truthfulness.shape === 'rules' ? (
                <ul class="list-disc pl-5 text-sm text-base-content/80">
                  {truthfulness.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              ) : truthfulness.flags ? (
                <div class="flex flex-wrap gap-1">
                  <span class="badge badge-outline badge-sm whitespace-nowrap">
                    Never claim an unexperienced skill:{' '}
                    {ruleState(truthfulness.flags.neverClaimUnexperiencedSkill)}
                  </span>
                  <span class="badge badge-outline badge-sm whitespace-nowrap">
                    Require accurate dates: {ruleState(truthfulness.flags.requireAccurateDates)}
                  </span>
                </div>
              ) : (
                <p class="text-sm text-base-content/60">Not recorded.</p>
              )}
              {truthfulness.flags?.notes ? (
                <p class="mt-1 text-sm text-base-content/70">{truthfulness.flags.notes}</p>
              ) : null}
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
            title="No identity recorded yet"
            description="Add your name and contact details so documents can use them."
          />
        )}
      </div>
    </section>
  )
}
