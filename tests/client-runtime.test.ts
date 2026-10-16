import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../app/client.ts', import.meta.url), 'utf8')
// Review has its own listeners; exercise the shared entry without importing a
// browser module into Bun's process-global DOM. No DOM dependency is required.
const javascript = new Bun.Transpiler({ loader: 'ts', target: 'browser' }).transformSync(
  source.replace("import './review'", ''),
)

function browser(readyState = 'loading') {
  const listeners = new Map<string, (event?: unknown) => void>()
  const elements = new Map<string, unknown>()
  const timers: { callback: () => void; delay: number }[] = []
  let initialized = 0
  let destroyed = 0
  const window = {
    htmx: { config: { allowNestedOobSwaps: true, responseHandling: [] as unknown[] } },
    Bouncer: class {
      constructor() {
        initialized++
      }
      destroy() {
        destroyed++
      }
    },
    setTimeout(callback: () => void, delay: number) {
      timers.push({ callback, delay })
    },
  }
  const document = {
    readyState,
    addEventListener(name: string, listener: (event?: unknown) => void) {
      listeners.set(name, listener)
    },
    body: {
      addEventListener(name: string, listener: (event?: unknown) => void) {
        listeners.set(name, listener)
      },
    },
    querySelector(selector: string) {
      return elements.get(selector) ?? null
    },
    getElementById(id: string) {
      return elements.get(id) ?? null
    },
  }
  const context = { window, document }
  runInNewContext(javascript, context)
  return {
    context,
    window,
    elements,
    listeners,
    timers,
    counts: () => ({ initialized, destroyed }),
  }
}

test('external client configures HTMX before startup and reinitializes validation after swaps', () => {
  const page = browser()
  expect(page.window.htmx.config.allowNestedOobSwaps).toBe(false)
  expect(page.window.htmx.config.responseHandling).toContainEqual({ code: '422', swap: true })
  expect(page.window.htmx.config.responseHandling).toContainEqual({ code: '409', swap: true })
  expect(page.window.htmx.config.responseHandling).toContainEqual({
    code: '[45]..',
    swap: false,
    error: true,
  })
  expect(page.counts().initialized).toBe(0)
  page.listeners.get('DOMContentLoaded')!()
  expect(page.counts()).toEqual({ initialized: 1, destroyed: 0 })
  page.listeners.get('htmx:afterSwap')!({ detail: { target: null } })
  expect(page.counts()).toEqual({ initialized: 2, destroyed: 1 })
  expect(browser('interactive').counts().initialized).toBe(1)
})

test('toast dismissal still schedules once, fades, and removes the message', () => {
  const page = browser()
  let removed = false
  const classes: string[] = []
  page.elements.set('#flash [data-flash-autodismiss]', {
    dataset: {},
    classList: { add: (...names: string[]) => classes.push(...names) },
    remove: () => {
      removed = true
    },
  })
  page.listeners.get('DOMContentLoaded')!()
  page.listeners.get('htmx:afterSwap')!({ detail: { target: null } })
  expect(page.timers).toHaveLength(1)
  expect(page.timers[0].delay).toBe(4000)
  page.timers[0].callback()
  expect(classes).toContain('opacity-0')
  expect(page.timers[1].delay).toBe(300)
  page.timers[1].callback()
  expect(removed).toBe(true)
})

test('renderer loads an external entry in development and production without inline scripts or island gating', () => {
  const renderer = readFileSync(new URL('../app/routes/_renderer.tsx', import.meta.url), 'utf8')
  expect(renderer).not.toContain('dangerouslySetInnerHTML')
  expect(renderer).not.toContain('HasIslands')
  expect(renderer).toContain('manifest.json')
  expect(renderer).toContain("['app/client.ts']")
  expect(renderer).toContain('<script type="module" src={clientSrc}>')
  expect(source).toContain("import './review'")
})

test('draft field handlers still serialize job analysis and update the emphasis total', () => {
  const page = browser()
  const hidden = { value: '' }
  const total = { textContent: '' }
  const fields = new Map<string, unknown>([
    ['textarea[name="jobAnalysis"]', hidden],
    ['[data-ja-role-purpose]', { value: 'Build useful products' }],
    ['[data-ja-fe="frontend"]', { value: '100' }],
    ['[data-ja-notes]', { value: '  Reviewed by user  ' }],
    ['[data-ja-fe-total]', total],
  ])
  const row = {
    querySelector: (selector: string) =>
      selector === '[data-ja-terms]' ? { value: 'invalid JSON' } : null,
  }
  page.elements.set('job-analysis-draft', {
    querySelector: (selector: string) => fields.get(selector) ?? null,
    querySelectorAll: (selector: string) => (selector === '[data-ja-requirement]' ? [row] : []),
  })
  runInNewContext('window.updateJobAnalysis()', page.context)
  const analysis = JSON.parse(hidden.value)
  expect(analysis.summary.rolePurpose).toBe('Build useful products')
  expect(analysis.notes).toBe('Reviewed by user')
  expect(analysis.requirements[0].terms).toEqual([])
  expect(analysis.classification.functionalEmphasis.frontend).toBe(100)
  expect(total.textContent).toBe('Total: 100')
})
