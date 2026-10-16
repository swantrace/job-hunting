import type { ParsedJobResult } from '../../../src/ai/client'
import type { Filters } from '../../../src/db/queries'
import { todayISO } from '../../../src/lib/date'
import { QuickCollect } from '../dashboard/Dashboard'

export function ParsedJobDraft({
  parsed,
  filters,
  jobPostText,
}: {
  parsed: ParsedJobResult
  filters: Filters
  jobPostText: string
}) {
  return (
    <div class="space-y-3">
      <div class="alert alert-info text-sm">
        Review the AI draft, then add Company, Job URL, Application source, and Direction before
        saving.
      </div>
      <QuickCollect
        filters={filters}
        formId="quick-form"
        oob
        jobAnalysis={parsed.analysis}
        values={{
          jobTitle: parsed.jobTitle,
          location: parsed.location ?? '',
          postedDate: parsed.postedDate ?? '',
          skills: '',
          salary: parsed.salary ?? '',
          direction: parsed.direction,
          parserModel: parsed.parserModel,
          parserPromptVersion: parsed.parserPromptVersion,
          analysisSchemaVersion: parsed.analysisPromptVersion,
          analysisPromptVersion: parsed.analysisPromptVersion,
          jobPostText,
        }}
      />
    </div>
  )
}
