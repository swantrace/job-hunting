import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { classTokens, renderJsx } from './support/html-contract'
import './support/runtime-mocks'

type FieldRenderer = (props: Record<string, unknown>) => unknown

const plannedModulePath = resolve(process.cwd(), 'app/components/ui/FormField.tsx')

async function loadFieldRenderer(): Promise<FieldRenderer | undefined> {
  const moduleId = existsSync(plannedModulePath)
    ? '../../app/components/ui/FormField'
    : '../../app/components/Dashboard'
  const module = (await import(moduleId)) as Record<string, unknown>
  return (module.FormField ?? module.InputField ?? module.Field) as FieldRenderer | undefined
}

async function renderField(): Promise<string> {
  const Field = await loadFieldRenderer()
  expect(Field).toEqual(expect.any(Function))
  if (!Field) return ''

  return renderJsx(
    Field({
      error: 'Job title is required.',
      help: 'Use the title from the job posting.',
      id: 'job-title',
      label: 'Job title',
      message: 'Job title is required.',
      name: 'jobTitle',
      required: true,
      value: '',
    }),
  )
}

describe('planned daisyUI 5 FormField contract', () => {
  test('is extracted to the roadmap-defined shared module', () => {
    expect(existsSync(plannedModulePath)).toBe(true)
  })

  test('uses current daisyUI 5 field structure', async () => {
    const html = await renderField()
    const classes = classTokens(html)

    expect(classes).toContain('fieldset')
    expect(classes.some((name) => name === 'fieldset-legend' || name === 'label')).toBe(true)
    expect(classes).toContain('input')
  })

  test('does not render removed daisyUI 4 form classes', async () => {
    const classes = classTokens(await renderField())
    const legacyClasses = [
      'form-control',
      'label-text',
      'label-text-alt',
      'input-bordered',
      'select-bordered',
      'textarea-bordered',
      'file-input-bordered',
    ]

    expect(classes.filter((name) => legacyClasses.includes(name))).toEqual([])
  })

  test('binds the control to visible help and error text with aria-describedby', async () => {
    const html = await renderField()
    expect(html).toMatch(/<input\b[^>]*\bid="job-title"/)

    const describedBy = html.match(/<input\b[^>]*\baria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeDefined()
    if (!describedBy) return

    const descriptionIds = describedBy.split(/\s+/).filter(Boolean)
    expect(descriptionIds.length).toBeGreaterThanOrEqual(2)
    for (const id of descriptionIds) expect(html).toContain(`id="${id}"`)
  })

  test('exposes invalid state without relying on color alone', async () => {
    const html = await renderField()
    expect(html).toMatch(/<input\b[^>]*\baria-invalid="true"/)
    expect(html).toContain('Job title is required.')
  })
})
