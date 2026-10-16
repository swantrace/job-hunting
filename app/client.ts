import './review'
import { updateApplicationSelection } from './application-selection'

type BouncerInstance = { destroy(): void }
declare global {
  interface Window {
    htmx: {
      config: {
        allowNestedOobSwaps: boolean
        responseHandling: { code: string; swap?: boolean; error?: boolean }[]
      }
    }
    Bouncer?: new (selector: string, options: { disableSubmit: boolean }) => BouncerInstance
    jobBouncer?: BouncerInstance
    updateJobAnalysis: () => void
  }
}

// Module scripts run before DOMContentLoaded, when htmx initializes the page.
window.htmx.config.allowNestedOobSwaps = false
window.htmx.config.responseHandling = [
  { code: '204', swap: false },
  { code: '409', swap: true },
  { code: '422', swap: true },
  { code: '[23]..', swap: true },
  { code: '[45]..', swap: false, error: true },
  { code: '...' },
]

function initBouncer() {
  if (!window.Bouncer) return
  window.jobBouncer?.destroy()
  window.jobBouncer = new window.Bouncer('form[novalidate]', { disableSubmit: true })
}

function dismissFlash() {
  const flash = document.querySelector<HTMLElement>('#flash [data-flash-autodismiss]')
  if (!flash || flash.dataset.dismissScheduled) return
  flash.dataset.dismissScheduled = 'true'
  window.setTimeout(() => {
    flash.classList.add('opacity-0', 'transition-opacity', 'duration-300')
    window.setTimeout(() => flash.remove(), 300)
  }, 4000)
}

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

// Keep the existing draft-field handlers compatible with the extracted module.
window.updateJobAnalysis = () => {
  const root = document.getElementById('job-analysis-draft')
  if (!root) return
  const value = (selector: string, parent: ParentNode = root) =>
    parent.querySelector<FormControl>(selector)?.value ?? ''
  const number = (selector: string) => {
    const parsed = Number(value(selector))
    return Number.isFinite(parsed) ? parsed : 0
  }
  const list = (selector: string) =>
    [...root.querySelectorAll<FormControl>(selector)]
      .map((element) => element.value.trim())
      .filter(Boolean)
  const summary = {
    rolePurpose: value('[data-ja-role-purpose]'),
    idealCandidate: value('[data-ja-ideal-candidate]'),
  }
  const classification = {
    roleType: value('[data-ja-role-type]'),
    advertisedSeniority: value('[data-ja-advertised]'),
    practicalSeniority: value('[data-ja-practical]'),
    rationale: value('[data-ja-rationale]'),
    functionalEmphasis: {
      frontend: number('[data-ja-fe="frontend"]'),
      backend: number('[data-ja-fe="backend"]'),
      testingQuality: number('[data-ja-fe="testingQuality"]'),
      devopsInfrastructure: number('[data-ja-fe="devopsInfrastructure"]'),
      collaborationOwnership: number('[data-ja-fe="collaborationOwnership"]'),
    },
  }
  const requirements = [...root.querySelectorAll<HTMLElement>('[data-ja-requirement]')].map(
    (row) => {
      let terms: { term: string }[] = []
      try {
        const parsed: unknown = JSON.parse(value('[data-ja-terms]', row))
        if (Array.isArray(parsed))
          terms = parsed.filter(
            (term): term is { term: string } =>
              term && typeof term.term === 'string' && term.term.trim(),
          )
      } catch {
        // Malformed term JSON must not prevent editing the rest of the draft.
      }
      return {
        type: value('[data-ja-type]', row),
        importance: value('[data-ja-importance]', row),
        basis: value('[data-ja-basis]', row),
        statement: value('[data-ja-statement]', row),
        sourceText: value('[data-ja-source]', row),
        inferenceRationale: value('[data-ja-inference]', row).trim() || null,
        terms,
      }
    },
  )
  const target = root.querySelector<HTMLTextAreaElement>('textarea[name="jobAnalysis"]')
  if (target)
    target.value = JSON.stringify({
      summary,
      classification,
      requirements,
      painPoints: list('[data-ja-pain]'),
      culture: list('[data-ja-culture]'),
      redFlags: list('[data-ja-red-flag]'),
      successMetrics: list('[data-ja-success]'),
      benefits: list('[data-ja-benefit]'),
      notes: value('[data-ja-notes]').trim() || null,
      interviewQuestions: list('[data-ja-interview]'),
    })
  const totalElement = root.querySelector('[data-ja-fe-total]')
  if (totalElement) {
    const total = Object.values(classification.functionalEmphasis).reduce(
      (sum, part) => sum + part,
      0,
    )
    totalElement.textContent = `Total: ${total}${total === 100 ? '' : ' (must be 100)'}`
  }
}

function initialize() {
  updateApplicationSelection()
  initBouncer()
  dismissFlash()
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize)
else initialize()

document.body.addEventListener('htmx:afterSwap', (event) => {
  initialize()
  const target = (event as CustomEvent<{ target?: Element }>).detail.target
  const formRegion = target?.matches('[data-autofocus]')
    ? target
    : target?.querySelector('[data-autofocus]')
  if (!formRegion) return
  formRegion.scrollIntoView({ behavior: 'smooth', block: 'start' })
  formRegion.querySelector<HTMLElement>('[data-primary-input]')?.focus()
})

function toggleDrawer(id: string, checked = true) {
  const toggle = document.getElementById(id) as HTMLInputElement | null
  if (toggle) toggle.checked = checked
}

document.body.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null
  const openQuickCollect = target?.closest('[data-open-quick-collect]')
  const closeQuickCollect = target?.closest('[data-close-quick-collect]')
  if (openQuickCollect || closeQuickCollect) {
    toggleDrawer('quick-collect-toggle', Boolean(openQuickCollect))
    return
  }
  if (target?.closest('[data-open-workspace]')) {
    toggleDrawer('workspace-toggle')
    return
  }
  const openDrawer = target?.closest<HTMLElement>('[data-open-drawer]')
  if (openDrawer?.dataset.openDrawer) {
    toggleDrawer(openDrawer.dataset.openDrawer)
    return
  }
  const tabButton = target?.closest<HTMLElement>('[data-workspace-tab]')
  if (!tabButton) return
  const shell = document.getElementById('workspace-shell') ?? document
  for (const panel of shell.querySelectorAll('[data-workspace-panel]'))
    panel.classList.toggle(
      'hidden',
      panel.id !== `workspace-${tabButton.dataset.workspaceTab}-panel`,
    )
  for (const button of shell.querySelectorAll<HTMLElement>('[data-workspace-tab]')) {
    const active = button === tabButton
    button.classList.toggle('tab-active', active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
  }
})

document.body.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('[data-open-ai-modal]')) return
  const dialog = document.getElementById('ai_parser_modal') as HTMLDialogElement | null
  dialog?.showModal?.()
})

document.body.addEventListener('htmx:responseError', () => {
  const flash = document.getElementById('flash')
  if (flash)
    flash.innerHTML = '<div class="alert alert-error">The request could not be completed.</div>'
})
