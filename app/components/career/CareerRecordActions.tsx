import { retiredQuery } from './helpers'

/**
 * The one place the record-state HTMX contract lives: edit into the section's
 * editor region, and move/retire/restore through the section route returning the
 * list fragment only. Retired records keep their history, remain visible in
 * "show retired" mode and can be restored.
 */
export function CareerRecordActions({
  section,
  id,
  retired,
  includeRetired,
  includeOrder = true,
}: {
  section:
    | 'experience'
    | 'education'
    | 'achievements'
    | 'projects'
    | 'skills'
    | 'stories'
    | 'publications'
  id: number
  retired: boolean
  includeRetired: boolean
  includeOrder?: boolean
}) {
  const query = retiredQuery(includeRetired)
  const listTarget = `#career-${section}-list`
  const state = (action: string) => (
    <button
      class="btn btn-ghost btn-xs"
      hx-post={`/career-data/${section}/${id}/retire${query}`}
      hx-vals={`{"action":"${action}"}`}
      hx-target={listTarget}
      hx-swap="outerHTML"
    >
      {action === 'retire' ? 'Retire' : 'Restore'}
    </button>
  )
  const move = (direction: 'up' | 'down') => (
    <button
      class="btn btn-ghost btn-xs"
      hx-post={`/career-data/${section}/${id}/order${query}`}
      hx-vals={`{"direction":"${direction}"}`}
      hx-target={listTarget}
      hx-swap="outerHTML"
      aria-label={`Move ${direction}`}
    >
      {direction === 'up' ? 'Move up' : 'Move down'}
    </button>
  )
  return (
    <div class="flex flex-wrap items-center gap-1">
      <button
        class="btn btn-ghost btn-xs"
        hx-get={`/career-data/${section}/${id}/form${query}`}
        hx-target={`#career-${section}-editor`}
        hx-swap="innerHTML"
      >
        Edit
      </button>
      {includeOrder ? (
        <>
          {move('up')}
          {move('down')}
        </>
      ) : null}
      {state(retired ? 'restore' : 'retire')}
    </div>
  )
}
