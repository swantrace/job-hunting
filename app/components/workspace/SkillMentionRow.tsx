import type { Filters } from '../../../src/db/queries'
import type { AnalysisMentionRow, CatalogSearchResult } from '../../../src/db/skill-mapping-service'
import { importanceRankLabel } from '../../../src/db/skill-mapping-service'
import { AliasRememberField } from './AliasRememberField'
import { query } from './helpers'
import { SkillSearchSelect } from './SkillSearchSelect'

/**
 * One requirement-owned term in the Review mapping section: its raw wording,
 * every requirement source, its stored state, the bounded catalog selector and
 * the explicit Map / Skip / Remember-as-alias / Unmap actions.
 *
 * The root map form carries the stable id `#skill-mention-<mentionId>`, and the
 * whole row is `#skill-mention-row-<mentionId>`; a validation failure is
 * retargeted at the smallest of the two that changed. Nothing here claims the
 * candidate has the skill: mapping records which catalog term the posting asked
 * for, and Skip is per run.
 */
export function SkillMentionRow({
  jobId,
  row,
  filters,
  suggestions,
  canDecide,
  mapError,
  aliasError,
}: {
  jobId: number
  row: AnalysisMentionRow
  filters: Filters
  suggestions: CatalogSearchResult[]
  canDecide: boolean
  mapError?: string
  aliasError?: string
}) {
  const action = `/applications/${jobId}/skill-mentions?${query(filters)}&workspaceTab=review`
  const searchUrl = `/applications/${jobId}/skill-mentions/search?mentionId=${row.id}`
  const stateBadge =
    row.mappingState === 'mapped'
      ? { class: 'badge-success', label: 'Mapped' }
      : row.mappingState === 'skipped'
        ? { class: 'badge-neutral', label: 'Skipped' }
        : { class: 'badge-warning', label: 'Pending' }
  const occurrences = row.occurrences.length

  return (
    <li id={`skill-mention-row-${row.id}`} class="rounded-box border border-base-300 p-3">
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
        <div class="col-start-1 row-start-1 min-w-0">
          <p class="font-medium">{row.rawTerm}</p>
          <p class="text-xs text-base-content/60">
            {importanceRankLabel(row.importance)} · requirement #{row.requirementSequence} ·{' '}
            {occurrences === 1 ? '1 occurrence' : `${occurrences} occurrences`}
          </p>
          <p class="mt-1 text-xs italic text-base-content/60">{row.requirementStatement}</p>
          {row.resolvedSkillName ? (
            <p class="mt-2 text-xs">
              Mapped to catalog skill <span class="font-medium">{row.resolvedSkillName}</span>
              {row.resolvedSkillKey ? (
                <span class="text-base-content/60"> ({row.resolvedSkillKey})</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div class="col-start-2 row-start-1 self-start justify-self-end">
          <span class={`badge whitespace-nowrap ${stateBadge.class}`}>{stateBadge.label}</span>
        </div>

        <div class="col-span-2 row-start-2">
          {row.mappingState === 'pending' ? (
            <form
              id={`skill-mention-${row.id}`}
              hx-post={action}
              hx-target="#skill-review-panel"
              hx-swap="outerHTML"
              hx-disabled-elt="find button"
              novalidate
            >
              <SkillSearchSelect
                mentionId={row.id}
                rawTerm={row.rawTerm}
                searchUrl={searchUrl}
                suggestions={suggestions}
                error={mapError}
                disabled={!canDecide}
              />
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <button type="submit" class="btn btn-primary btn-sm" disabled={!canDecide}>
                  Map to skill
                </button>
                <button
                  type="submit"
                  name="action"
                  value="skip"
                  class="btn btn-outline btn-sm"
                  disabled={!canDecide}
                >
                  Skip term
                </button>
              </div>
            </form>
          ) : (
            <form
              id={`skill-mention-actions-${row.id}`}
              hx-post={action}
              hx-target="#skill-review-panel"
              hx-swap="outerHTML"
              hx-disabled-elt="find button"
            >
              <input type="hidden" name="mentionId" value={row.id} />
              <button
                type="submit"
                name="action"
                value="unmap"
                class="btn btn-ghost btn-sm"
                disabled={!canDecide}
              >
                {row.mappingState === 'skipped' ? 'Return to pending' : 'Unmap'}
              </button>
            </form>
          )}

          {row.mappingState === 'mapped' ? (
            <AliasRememberField
              mentionId={row.id}
              term={row.rawTerm}
              action={action}
              disabled={!canDecide}
              aliasError={aliasError}
            />
          ) : null}

          {!canDecide ? (
            <p class="mt-2 text-xs text-base-content/60">
              Re-run the job analysis to change this term.
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}
