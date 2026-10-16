import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

test('batch selection synchronizes responsive duplicates, select all, clear, and the 200-item limit', () => {
  const listeners = new Map<string, (event: { target: unknown }) => void>()
  class Element {
    closest(selector: string) {
      return selector === '[data-clear-application-selection]' ? this : null
    }
  }
  class Input extends Element {
    checked = false
    indeterminate = false
    constructor(
      public value: string,
      private kind = 'data-application-selection',
    ) {
      super()
    }
    matches(selector: string) {
      return selector === `[${this.kind}]`
    }
  }
  let inputs = [new Input('1'), new Input('1'), new Input('2'), new Input('2')]
  const all = new Input('', 'data-select-all-applications')
  const count = { textContent: '' }
  const run = { disabled: true }
  const document = {
    addEventListener(name: string, handler: (event: { target: unknown }) => void) {
      listeners.set(name, handler)
    },
    querySelectorAll() {
      return inputs
    },
    querySelector(selector: string) {
      if (selector === '[data-select-all-applications]') return all
      if (selector === '[data-application-selection-count]') return count
      if (selector === '[data-run-batch-analysis]') return run
      return null
    },
  }
  const source = readFileSync(
    new URL('../app/application-selection.ts', import.meta.url),
    'utf8',
  ).replace('export function', 'function')
  const js = new Bun.Transpiler({ loader: 'ts', target: 'browser' }).transformSync(source)
  const context = {
    document,
    Element,
    HTMLInputElement: Input,
    updateApplicationSelection: undefined as unknown as () => void,
  }
  runInNewContext(js, context)
  context.updateApplicationSelection()
  expect(count.textContent).toBe('0 selected')
  expect(run.disabled).toBe(true)
  inputs[0].checked = true
  listeners.get('change')!({ target: inputs[0] })
  expect(inputs[1].checked).toBe(true)
  expect(count.textContent).toBe('1 selected')
  expect(all.indeterminate).toBe(true)
  expect(run.disabled).toBe(false)
  all.checked = true
  listeners.get('change')!({ target: all })
  expect(inputs.every((input) => input.checked)).toBe(true)
  expect(count.textContent).toBe('2 selected')
  expect(all.indeterminate).toBe(false)
  listeners.get('click')!({ target: new Element() })
  expect(inputs.some((input) => input.checked)).toBe(false)
  expect(count.textContent).toBe('0 selected')
  expect(run.disabled).toBe(true)
  inputs = Array.from({ length: 201 }, (_, i) => new Input(String(i)))
  all.checked = true
  listeners.get('change')!({ target: all })
  expect(run.disabled).toBe(true)
  expect(count.textContent).toBe('201 selected')
  // Filter swaps replace #board; selection must reset instead of leaking old IDs.
  inputs = [new Input('3')]
  context.updateApplicationSelection()
  expect(all.checked).toBe(false)
  expect(count.textContent).toBe('0 selected')
})
