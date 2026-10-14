import { db } from '../../../src/db/client'
import type { Filters } from '../../../src/db/queries'
import {
  type AnalysisMappingData,
  type AnalysisMentionRow,
  type CatalogSearchResult,
  importanceRankLabel,
  searchApprovedCatalog,
} from '../../../src/db/skill-mapping-service'
import type { SkillCategoryDefinition } from '../../../src/lib/skills/taxonomy'
import { CreateSkillForm } from './CreateSkillForm'
import { query } from './helpers'
import { SkillMentionRow } from './SkillMentionRow'

const importanceRank = { required: 3, preferred: 2, mentioned: 1 } as const

/**
 * The Review mapping section root (`#skill-mapping-panel`).
 *
 * Pending terms come first, one row per unresolved term, because they are the
 * ones that block candidate analysis and documents. Terms that already resolved
 * are grouped by canonical skill id — one group per skill, aggregating every
 * requirement source and the strongest importance — so repeated wording for one
 * skill never looks like several skills. Skipped terms stay visible and
 * reversible; they are per run and never hide the catalog skill globally.
 *
 * Mapping a term to a catalog skill explicitly does not claim the candidate has
 * it, and creating a catalog entry does not add a personal skill. Both the copy
 * and the service enforce that.
 */
export function SkillMappingPanel({
  jobId,
  filters,
  mapping,
  categories,
  suggestionLimit = 5,
  searchCatalog = (term, limit) => searchApprovedCatalog(db, term, limit),
  canDecide = true,
}: {
  jobId: number
  filters: Filters
  mapping: AnalysisMappingData
  categories: SkillCategoryDefinition[]
  suggestionLimit?: number
  searchCatalog?: (query: string, limit: number) => CatalogSearchResult[]
  canDecide?: boolean
}) {
  const action = `/applications/${jobId}/skill-mentions?${query(filters)}&workspaceTab=review`
  const mentionsById = new Map(mapping.mentions.map((mention) => [mention.id, mention]))
  const pending = mapping.mentions
    .filter((mention) => mention.mappingState === 'pending')
    .sort(byImportanceThenSequence)
  const skipped = mapping.mentions
    .filter((mention) => mention.mappingState === 'skipped')
    .sort(byImportanceThenSequence)

  return (
    <section
      id="skill-mapping-panel"
      class="rounded-box border border-base-300 p-4"
      aria-labelledby="skill-mapping-panel-heading"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="skill-mapping-panel-heading" class="font-semibold">
            Job skill mapping
          </h3>
          <p class="mt-1 text-sm text-base-content/60">
            Resolve every term the job post named before candidate analysis or document generation.
            Mapping records which catalog skill the posting asked for — it never claims you have the
            skill, and Skip only applies to this application's run.
          </p>
        </div>
        <span
          id="skill-mapping-pending-count"
          class="badge whitespace-nowrap badge-warning"
          role="status"
        >
          {mapping.pendingCount === 1 ? '1 term pending' : `${mapping.pendingCount} terms pending`}
        </span>
      </div>

      {mapping.mentions.length === 0 ? (
        <p class="mt-3 text-sm text-base-content/60">
          No unresolved skill terms were extracted from this job post.
        </p>
      ) : (
        <div class="mt-3 space-y-5">
          <section aria-labelledby="skill-mapping-pending-heading">
            <h4 id="skill-mapping-pending-heading" class="mb-2 font-semibold">
              Unresolved job terms
            </h4>
            {pending.length === 0 ? (
              <p class="text-sm text-base-content/60">
                Every extracted term has an explicit decision.
              </p>
            ) : (
              <ul class="space-y-2">
                {pending.map((mention) => (
                  <MentionRow
                    action={action}
                    canDecide={canDecide}
                    filters={filters}
                    jobId={jobId}
                    key={mention.id}
                    mention={mention}
                    searchCatalog={searchCatalog}
                    suggestionLimit={suggestionLimit}
                  />
                ))}
              </ul>
            )}
          </section>

          {mapping.groups.map((group) => (
            <section aria-labelledby={`skill-mapping-group-${group.skillId}`}>
              <h4 id={`skill-mapping-group-${group.skillId}`} class="mb-2 font-semibold">
                {group.skillName}
                <span class="badge badge-neutral badge-sm ml-2 whitespace-nowrap">
                  {importanceRankLabel(group.importance)}
                </span>
                <span class="ml-2 text-xs font-normal text-base-content/60">
                  {group.sources.length === 1 ? '1 source' : `${group.sources.length} sources`}
                </span>
              </h4>
              <ul class="space-y-2">
                {group.sources
                  .map((source) => mentionsById.get(source.mentionId))
                  .filter((mention): mention is AnalysisMentionRow => !!mention)
                  .map((mention) => (
                    <MentionRow
                      action={action}
                      canDecide={canDecide}
                      filters={filters}
                      jobId={jobId}
                      key={mention.id}
                      mention={mention}
                      searchCatalog={searchCatalog}
                      suggestionLimit={suggestionLimit}
                    />
                  ))}
              </ul>
            </section>
          ))}

          {skipped.length > 0 ? (
            <section aria-labelledby="skill-mapping-skipped-heading">
              <h4 id="skill-mapping-skipped-heading" class="mb-2 font-semibold">
                Skipped terms
              </h4>
              <ul class="space-y-2">
                {skipped.map((mention) => (
                  <MentionRow
                    action={action}
                    canDecide={canDecide}
                    filters={filters}
                    jobId={jobId}
                    key={mention.id}
                    mention={mention}
                    searchCatalog={searchCatalog}
                    suggestionLimit={suggestionLimit}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <div class="mt-4">
        <CreateSkillForm
          categories={categories}
          action={action}
          term=""
          selectedCategory={null}
          mentionId={null}
        />
      </div>
    </section>
  )
}

function byImportanceThenSequence(left: AnalysisMentionRow, right: AnalysisMentionRow) {
  return (
    importanceRank[right.importance] - importanceRank[left.importance] ||
    left.requirementSequence - right.requirementSequence ||
    left.id - right.id
  )
}

function MentionRow({
  action,
  canDecide,
  filters,
  jobId,
  mention,
  searchCatalog,
  suggestionLimit,
}: {
  action: string
  canDecide: boolean
  filters: Filters
  jobId: number
  mention: AnalysisMentionRow
  searchCatalog: (query: string, limit: number) => CatalogSearchResult[]
  suggestionLimit: number
}) {
  return (
    <SkillMentionRow
      jobId={jobId}
      row={mention}
      filters={filters}
      suggestions={searchCatalog(mention.rawTerm, suggestionLimit)}
      canDecide={canDecide}
    />
  )
}
