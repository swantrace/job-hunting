type DraftValidationWarning = { code: string; message: string }
type DraftValidationRecord = {
  resume: DraftValidationWarning[]
  coverLetter: DraftValidationWarning[]
}

function parseValidation(json: string | null): DraftValidationRecord | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Partial<DraftValidationRecord>
    if (!Array.isArray(record.resume) || !Array.isArray(record.coverLetter)) return null
    return record as DraftValidationRecord
  } catch {
    return null
  }
}

function MarkdownDraft({ label, markdown }: { label: string; markdown: string | null }) {
  if (!markdown) return null
  return (
    <details class="rounded-box border border-base-300 p-3 text-sm">
      <summary class="cursor-pointer font-semibold">{label}</summary>
      <pre class="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed">{markdown}</pre>
    </details>
  )
}

function Warnings({ warnings }: { warnings: DraftValidationWarning[] }) {
  if (!warnings.length)
    return <p class="text-sm text-base-content/60">No deterministic warnings.</p>
  return (
    <ul class="space-y-1">
      {warnings.map((warning) => (
        <li class="flex flex-wrap items-center gap-2 text-sm">
          <span class="badge badge-warning badge-sm">{warning.code}</span>
          <span class="text-base-content/70">{warning.message}</span>
        </li>
      ))}
    </ul>
  )
}

export function DraftReview({
  resumeMarkdown,
  coverLetterMarkdown,
  draftValidationJson,
}: {
  resumeMarkdown: string | null
  coverLetterMarkdown: string | null
  draftValidationJson: string | null
}) {
  if (!resumeMarkdown && !coverLetterMarkdown) return null
  const validation = parseValidation(draftValidationJson)
  return (
    <div class="mt-4 space-y-3">
      <h4 class="font-semibold">Reviewed Markdown drafts</h4>
      <MarkdownDraft label="Resume draft (Markdown)" markdown={resumeMarkdown} />
      <MarkdownDraft label="Cover letter draft (Markdown)" markdown={coverLetterMarkdown} />
      {validation ? (
        <details class="rounded-box border border-base-300 p-3 text-sm">
          <summary class="cursor-pointer font-semibold">Deterministic completeness checks</summary>
          <div class="mt-2 space-y-4">
            <div>
              <p class="mb-1 font-medium">Resume</p>
              <Warnings warnings={validation.resume} />
            </div>
            <div>
              <p class="mb-1 font-medium">Cover letter</p>
              <Warnings warnings={validation.coverLetter} />
            </div>
          </div>
        </details>
      ) : null}
    </div>
  )
}
