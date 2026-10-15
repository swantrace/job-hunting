import type { ChatGptContextPreview } from '../../../src/lib/career/chatgpt-context'
import { CheckboxField } from '../ui/form-fields/CheckboxField'
import { SelectField } from '../ui/form-fields/SelectField'

export const chatGptContextFormId = 'chatgpt-context-form'
export const chatGptContextPreviewId = 'chatgpt-context-preview'

/**
 * ChatGPT JSON context export.
 *
 * The form produces *one* valid JSON document, full or direction-scoped. Contact
 * details and private URLs are excluded by default and only included through an
 * explicit opt-in control. There is no ChatGPT network call: the export is a file
 * the operator downloads and pastes into ChatGPT themselves.
 */
export function ChatGptContextExportForm({
  directions,
  directionKey,
  includeSourceUrls,
  includeContactDetails,
}: {
  directions: { key: string; label: string }[]
  directionKey: string
  includeSourceUrls: boolean
  includeContactDetails: boolean
}) {
  return (
    <form
      id={chatGptContextFormId}
      class="card border border-base-300 bg-base-100"
      method="get"
      action="/career-data/transfer/export/context"
    >
      <div class="card-body gap-4">
        <h3 class="card-title text-base">Export one ChatGPT JSON context</h3>
        <p class="text-sm text-base-content/70">
          Builds the safe facts, the direction evidence index, the effective editorial rules, the
          approved Base Resume and the source identities as a single JSON document. No ChatGPT API
          call is made.
        </p>
        <SelectField
          id="chatgpt-context-direction"
          name="direction"
          label="Scope"
          value={directionKey}
          help="A direction-scoped export keeps that direction and the records linked to it."
        >
          <option value="" selected={directionKey === ''}>
            Full export — every direction with an approved Base Resume
          </option>
          {directions.map((direction) => (
            <option value={direction.key} selected={direction.key === directionKey}>
              {direction.label}
            </option>
          ))}
        </SelectField>
        <CheckboxField
          id="chatgpt-context-source-urls"
          name="includeSourceUrls"
          label="Include private source URLs"
          checked={includeSourceUrls}
          help="Publication source URLs and project URLs. Off by default; the export stays private."
        />
        <CheckboxField
          id="chatgpt-context-contact-details"
          name="includeContactDetails"
          label="Include contact details"
          checked={includeContactDetails}
          help="Email, phone, postal location, website and social profile URLs. Off by default; only the name is exported."
        />
        <div class="card-actions justify-end">
          <button class="btn btn-primary">Build and download JSON</button>
        </div>
      </div>
    </form>
  )
}

const countLabels: Array<[keyof ChatGptContextPreview['counts'], string]> = [
  ['experiences', 'Experiences'],
  ['safeAchievements', 'Safe achievements'],
  ['safePublications', 'Safe publications'],
  ['eligibleProjects', 'Resume-eligible projects'],
  ['personalSkills', 'My skills'],
  ['stories', 'Stories'],
  ['education', 'Education'],
]

/** What the current scope and privacy choices would put in the downloaded file. */
export function ChatGptContextPreviewPanel({
  preview,
  error,
}: {
  preview: ChatGptContextPreview
  error?: string
}) {
  return (
    <section id={chatGptContextPreviewId} class="card border border-base-300 bg-base-100">
      <div class="card-body gap-4">
        <h3 class="card-title text-base">Contents of this export</h3>
        {error ? <div class="alert alert-warning">{error}</div> : null}
        <p class="text-sm text-base-content/70">
          Scope:{' '}
          {preview.scope.kind === 'full' ? 'full' : `direction ${preview.scope.directionKey}`} ·
          Private source URLs {preview.includeSourceUrls ? 'included' : 'excluded'} · Contact
          details {preview.includeContactDetails ? 'included' : 'excluded'}
        </p>
        {preview.directionsMissingBaseResume.length > 0 ? (
          <div class="alert alert-info text-sm">
            Not exported — no approved Base Resume: {preview.directionsMissingBaseResume.join(', ')}
          </div>
        ) : null}
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <caption class="text-left text-sm text-base-content/70">
              Schema version 1 · {preview.directions.length} direction(s) in scope
            </caption>
            <thead>
              <tr>
                <th scope="col">Direction</th>
                <th scope="col">Approved Base Resume</th>
                <th scope="col">Editing rules</th>
              </tr>
            </thead>
            <tbody>
              {preview.directions.map((direction) => (
                <tr>
                  <th scope="row">{direction.label}</th>
                  <td>
                    {direction.approvedBaseResume
                      ? `${direction.approvedBaseResume.version} (approved ${direction.approvedBaseResume.approvedAt})`
                      : 'None — excluded from the export'}
                  </td>
                  <td>{direction.rulesDeclared ? 'Direction rules' : 'Seeded defaults'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {countLabels.map(([key, label]) => (
            <div>
              <dt class="text-xs font-semibold uppercase tracking-wider text-base-content/50">
                {label}
              </dt>
              <dd class="text-sm">{preview.counts[key]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
