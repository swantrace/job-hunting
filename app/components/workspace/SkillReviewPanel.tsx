import type { Filters, JobCardData } from '../../../src/db/queries'
import type {
  AnalysisMappingData,
  CatalogSearchResult,
} from '../../../src/db/skill-mapping-service'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import type { SkillCategoryDefinition } from '../../../src/lib/skills/taxonomy'
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
}) {
  return (
    <div id="skill-review-panel" {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}>
      <SkillMappingPanel
        jobId={job.id}
        filters={filters}
        mapping={mapping}
        categories={categories}
        searchCatalog={searchCatalog}
        canDecide={canMap}
      />
      <div class="mt-4">
        <SkillGapPanel
          job={job}
          filters={filters}
          requirements={requirements}
          careerEvidence={careerEvidence}
          canDecide={canDecide}
        />
      </div>
    </div>
  )
}
