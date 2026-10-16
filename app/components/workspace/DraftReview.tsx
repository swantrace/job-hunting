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

type AtsAuditMatch = { canonical: string; matched: string }
type AtsAuditRecord = {
  exactMatches: AtsAuditMatch[]
  aliasMatches: Array<AtsAuditMatch & { alias: string }>
  missingButSupported: AtsAuditMatch[]
  unsupportedTerms: AtsAuditMatch[]
  repetitionWarnings: string[]
  coverage: { matchedWeight: number; totalWeight: number; percentage: number | null }
}
type AtsAuditResults = { resume: AtsAuditRecord; coverLetter: AtsAuditRecord }

function parseAtsAudit(json: string | null): AtsAuditResults | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Partial<AtsAuditResults>
    if (!record.resume || !record.coverLetter) return null
    return record as AtsAuditResults
  } catch {
    return null
  }
}

function AtsTermList({
  label,
  badge,
  terms,
}: {
  label: string
  badge: string
  terms: AtsAuditMatch[]
}) {
  if (!terms.length) return null
  return (
    <div>
      <p class="mb-1">
        <span class={`badge badge-sm ${badge}`}>{label}</span>
      </p>
      <ul class="space-y-1 text-sm text-base-content/70">
        {terms.map((term) => (
          <li>{term.canonical}</li>
        ))}
      </ul>
    </div>
  )
}

function AtsAudit({ label, audit }: { label: string; audit: AtsAuditRecord }) {
  const { coverage, repetitionWarnings } = audit
  const summary =
    coverage.percentage === null
      ? 'No weighted Job Description terms to audit.'
      : `${coverage.percentage.toFixed(0)}% of weighted terms matched (${coverage.matchedWeight}/${coverage.totalWeight})`
  return (
    <div class="space-y-3">
      <p class="font-medium">{label}</p>
      <p class="text-sm text-base-content/70">Coverage: {summary}</p>
      <AtsTermList label="Matched exactly" badge="badge-success" terms={audit.exactMatches} />
      <AtsTermList
        label="Matched by alias"
        badge="badge-success"
        terms={audit.aliasMatches.map((match) => ({
          canonical: `${match.canonical} — matched as "${match.alias}"`,
          matched: match.matched,
        }))}
      />
      <AtsTermList
        label="Missing, safe to add (evidence supports it)"
        badge="badge-info"
        terms={audit.missingButSupported}
      />
      <AtsTermList
        label="Missing, no evidence — do not add"
        badge="badge-warning"
        terms={audit.unsupportedTerms}
      />
      {repetitionWarnings.length ? (
        <div>
          <p class="mb-1">
            <span class="badge badge-warning badge-sm">Repetition warnings</span>
          </p>
          <ul class="space-y-1 text-sm text-base-content/70">
            {repetitionWarnings.map((warning) => (
              <li>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
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
  atsAuditJson,
}: {
  resumeMarkdown: string | null
  coverLetterMarkdown: string | null
  draftValidationJson: string | null
  atsAuditJson: string | null
}) {
  if (!resumeMarkdown && !coverLetterMarkdown) return null
  const validation = parseValidation(draftValidationJson)
  const audit = parseAtsAudit(atsAuditJson)
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
      {audit ? (
        <details class="rounded-box border border-base-300 p-3 text-sm">
          <summary class="cursor-pointer font-semibold">ATS keyword audit</summary>
          <p class="mt-2 text-sm text-base-content/60">
            Deterministic: the generated text checked against the reviewed Job Description terms. No
            model is involved.
          </p>
          <div class="mt-2 space-y-4">
            <AtsAudit label="Resume" audit={audit.resume} />
            <AtsAudit label="Cover letter" audit={audit.coverLetter} />
          </div>
        </details>
      ) : null}
    </div>
  )
}
