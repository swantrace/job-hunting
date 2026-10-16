// Native event delegation; no component hydration or inline event handlers.
export {}

const preferences = new Map<string, boolean>()
let scroll: { element: Element | null; top: number; windowY: number } | undefined
function root() {
  return document.querySelector<HTMLElement>('#skill-review-panel')
}
function filter() {
  const panel = root()
  const input = panel?.querySelector<HTMLInputElement>('[data-review-filter]')
  if (!panel || !input) return
  const id = panel.dataset.reviewJob ?? ''
  input.checked = preferences.get(id) ?? true
  const rows = [...panel.querySelectorAll<HTMLElement>('[data-review-skill]')]
  for (const row of rows) row.hidden = input.checked && row.dataset.reviewPending !== 'true'
  for (const group of panel.querySelectorAll<HTMLElement>('[data-review-group]'))
    group.hidden = ![...group.querySelectorAll<HTMLElement>('[data-review-skill]')].some(
      (row) => !row.hidden,
    )
  const empty = panel.querySelector<HTMLElement>('[data-review-empty]')
  if (empty) empty.hidden = rows.some((row) => !row.hidden)
}
function dirty() {
  return (
    !!root()?.querySelector<HTMLTextAreaElement>('textarea[name="reason"]:not([disabled])') &&
    [...root()!.querySelectorAll<HTMLTextAreaElement>('textarea[name="reason"]')].some(
      (input) => input.value.trim() !== '',
    )
  )
}
document.addEventListener('click', (event) => {
  const button =
    event.target instanceof Element ? event.target.closest('[popovertargetaction="hide"]') : null
  const id = button?.getAttribute('popovertarget')
  if (!id || !root()?.contains(button)) return
  const reason = document
    .getElementById(id)
    ?.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')
  if (reason) reason.value = ''
})
document.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches('[data-review-filter]')) {
    preferences.set(root()?.dataset.reviewJob ?? '', event.target.checked)
    filter()
  }
})
document.addEventListener('htmx:beforeRequest', (event) => {
  const detail = (event as CustomEvent).detail
  const element = detail.elt as Element | undefined
  if (element?.matches('[data-review-refresh]') && dirty()) {
    event.preventDefault()
    const notice = root()?.querySelector<HTMLElement>('[data-review-refresh-notice]')
    if (notice) notice.hidden = false
    return
  }
  if (root()?.contains(element ?? null)) {
    const container = root()?.closest('.drawer-side') ?? null
    scroll = { element: container, top: container?.scrollTop ?? 0, windowY: window.scrollY }
  }
})
document.addEventListener('htmx:afterSwap', () => {
  filter()
  if (scroll) {
    if (scroll.element?.isConnected) scroll.element.scrollTop = scroll.top
    window.scrollTo(0, scroll.windowY)
    scroll = undefined
  }
})
window.addEventListener('focus', async () => {
  const panel = root()
  const button = panel?.querySelector<HTMLButtonElement>('[data-review-refresh]')
  const url = button?.getAttribute('hx-get')
  if (!panel || !button || !url) return
  const notice = panel?.querySelector<HTMLElement>('[data-review-refresh-notice]')
  try {
    const response = await fetch(`${url}&probe=1`, { credentials: 'same-origin' })
    if (!response.ok) return
    const result = (await response.json()) as { revision: string }
    if (!panel.isConnected || result.revision === panel.dataset.reviewRevision) return
    if (dirty()) {
      if (notice) notice.hidden = false
    } else button.click()
  } catch {
    /* Manual refresh remains available while offline. */
  }
})
filter()
