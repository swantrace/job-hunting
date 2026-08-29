import type { Filters } from '../../src/db/queries'
import type { ParsedJobResult } from '../../src/lib/ai'
import { todayISO } from '../../src/lib/date'
import { QuickCollect } from './Dashboard'

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
        skillRequirements={parsed.skills}
        jobAnalysis={parsed.analysis}
        values={{
          jobTitle: parsed.jobTitle,
          location: parsed.location ?? '',
          postedDate: parsed.postedDate ?? todayISO(),
          skills: '',
          salary: parsed.salary ?? '',
          analysisRequirements: parsed.requirements.join('\n'),
          analysisResponsibilities: parsed.responsibilities.join('\n'),
          analysisPainPoints: parsed.painPoints.join('\n'),
          analysisCulture: parsed.culture.join('\n'),
          analysisRedFlags: parsed.redFlags.join('\n'),
          analysisSuccessMetrics: parsed.successMetrics.join('\n'),
          analysisBenefits: parsed.benefits.join('\n'),
          analysisNotes: parsed.notes ?? '',
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
