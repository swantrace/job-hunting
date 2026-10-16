import type { Filters, JobCardData } from '../../../src/db/queries'
import type {
  AnalysisMappingData,
  CatalogSearchResult,
} from '../../../src/db/skill-mapping-service'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import { canonicalHash } from '../../../src/lib/canonical-hash'
import type { SkillCategoryDefinition } from '../../../src/lib/skills/taxonomy'
import { query } from './helpers'
import { SkillGapPanel } from './SkillGapPanel'
import { SkillMappingPanel } from './SkillMappingPanel'

/**
 * The single `#skill-review-panel` fragment: the requirement-term mapping
 * section followed by the canonical skill gap review. Both halves refresh
 * together so a decision and the mapping rows can never disagree on screen.
 *
 * The whole fragment is the stable swap target for the skill-decision and
 * skill-mapping routes, and it is emitted as an intentional OOB sibling while a
 * candidate analysis run is polling.
 */
export function SkillReviewPanel({
  job,
  filters,
  requirements,
  careerEvidence,
  mapping,
  categories,
  searchCatalog,
  canMap = true,
  canDecide = true,
  oob = false,
  retainSkillId,
}: {
  job: JobCardData
  filters: Filters
  requirements: RunSkillReview[]
  careerEvidence: Record<string, string[]>
  mapping: AnalysisMappingData
  categories: SkillCategoryDefinition[]
  searchCatalog?: (query: string, limit: number) => CatalogSearchResult[]
  /**
   * Mapping needs a current Job Analysis, not a candidate run: unresolved terms
   * are resolved before candidate analysis, so the mapping panel must never be
   * disabled by the very run it is meant to unblock.
   */
  canMap?: boolean
  canDecide?: boolean
  oob?: boolean
  retainSkillId?: number
}) {
  return (
    <div
      id="skill-review-panel"
      data-review-job={job.id}
      data-review-revision={canonicalHash({ requirements, mapping })}
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-base-content/60">
          Catalog approval does not change your career facts.
        </p>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          data-review-refresh
          hx-get={`/applications/${job.id}/skill-review?${query(filters)}&workspaceTab=review`}
          hx-target="#skill-review-panel"
          hx-swap="outerHTML"
          aria-label="Refresh skill review without rerunning AI"
        >
          ↻ Refresh
        </button>
      </div>
      <p data-review-refresh-notice class="mb-3 text-sm text-warning" hidden>
        Skill data may have changed. Save or cancel your reason before refreshing.
      </p>
      <details class="mb-4">
        <summary class="cursor-pointer text-sm">Advanced skill mapping</summary>
        <SkillMappingPanel
          jobId={job.id}
          filters={filters}
          mapping={mapping}
          categories={categories}
          searchCatalog={searchCatalog}
          canDecide={canMap}
        />
      </details>
      <div class="mt-4">
        <SkillGapPanel
          job={job}
          filters={filters}
          requirements={requirements}
          careerEvidence={careerEvidence}
          canDecide={canDecide}
          retainSkillId={retainSkillId}
        />
      </div>
    </div>
  )
}
