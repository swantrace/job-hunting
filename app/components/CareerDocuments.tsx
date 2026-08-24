import type { BaselineGenerationRunWithArtifacts } from '../../src/db/generation'
import { listProfiles } from '../../src/lib/profiles'

export function CareerDocumentsPage({ runs }: { runs: BaselineGenerationRunWithArtifacts[] }) {
  return (
    <main class="mx-auto min-h-screen max-w-5xl space-y-6 p-4 lg:p-7">
      <header>
        <a class="link text-sm" href="/">
          ← Dashboard
        </a>
        <h1 class="mt-2 text-3xl font-bold">Career documents</h1>
        <p class="text-base-content/60">
          Create a direction-specific baseline resume before a particular job post exists.
        </p>
      </header>
      <BaselineGenerationPanel runs={runs} />
    </main>
  )
}

export function BaselineGenerationPanel({ runs }: { runs: BaselineGenerationRunWithArtifacts[] }) {
  const profiles = listProfiles()
  const latest = runs[0]
  const polling = latest?.status === 'Queued' || latest?.status === 'Processing'
  return (
    <section
      id="baseline-generation-panel"
      class="card border border-base-300 bg-base-100 shadow-sm"
      {...(polling
        ? {
            'hx-get': '/career-documents/generation-runs',
            'hx-trigger': 'every 3s',
            'hx-swap': 'outerHTML',
          }
        : {})}
    >
      <div class="card-body">
        <div>
          <h2 class="card-title">Generate baseline resume</h2>
          <p class="text-sm text-base-content/60">
            Uses the selected profile’s verified career data. No job, company, or cover letter is
            created.
          </p>
        </div>
        <form
          class="mt-2 grid gap-4 md:grid-cols-2"
          hx-post="/career-documents/generation-runs"
          hx-target="#baseline-generation-panel"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
          novalidate
        >
          <label class="form-control">
            <span class="label-text">Direction</span>
            <select class="select select-bordered" name="direction">
              {profiles.map((profile) => (
                <option value={profile.id}>{profile.label}</option>
              ))}
            </select>
          </label>
          <label class="form-control">
            <span class="label-text">Target title</span>
            <input
              class="input input-bordered"
              name="targetTitle"
              placeholder="FHIR Software Engineer (optional)"
            />
          </label>
          <label class="form-control md:col-span-2">
            <span class="label-text">Optional keywords</span>
            <input
              class="input input-bordered"
              name="targetKeywords"
              placeholder="FHIR, SMART on FHIR, interoperability"
            />
            <span class="label-text-alt">
              Comma-separated; only profile-allowed conditional skills may be added.
            </span>
          </label>
          <div class="md:col-span-2">
            <button class="btn btn-primary">
              <span class="loading loading-spinner loading-xs htmx-indicator" /> Generate resume
            </button>
          </div>
        </form>
        {latest && <BaselineRun run={latest} />}
      </div>
    </section>
  )
}

function BaselineRun({ run }: { run: BaselineGenerationRunWithArtifacts }) {
  const tone =
    run.status === 'Completed'
      ? 'badge-success'
      : run.status === 'Failed'
        ? 'badge-error'
        : 'badge-warning'
  return (
    <div class="mt-4 rounded-box bg-base-200 p-4 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        <strong>{run.targetTitle}</strong>
        <span class="badge badge-outline">{run.direction}</span>
        <span class={`badge ${tone}`}>{run.status}</span>
        <span class="text-base-content/60">Attempts: {run.attempts}</span>
      </div>
      {run.errorMessage && <p class="mt-2 text-error">{run.errorMessage}</p>}
      {run.artifacts.length > 0 && (
        <div class="mt-3 flex flex-wrap gap-2">
          {run.artifacts.map((artifact) => (
            <a class="btn btn-outline btn-sm" href={`/baseline-artifacts/${artifact.id}`}>
              Download resume DOCX
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
