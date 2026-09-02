import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('resource filter HTMX contracts', () => {
  test('skills and companies routes return a fragment on HX-Request', () => {
    expect(read('app/routes/skills/index.tsx')).toContain("c.req.header('HX-Request') === 'true'")
    expect(read('app/routes/companies/index.tsx')).toContain(
      "c.req.header('HX-Request') === 'true'",
    )
  })

  test('skills form auto-filters on search and both selects', () => {
    const source = read('app/components/skills/SkillsTable.tsx')
    expect(source).toContain("from:input[name='q']")
    expect(source).toContain("change from:select[name='category']")
    expect(source).toContain("change from:select[name='status']")
  })

  test('companies form auto-filters on search', () => {
    const source = read('app/components/companies/CompaniesTable.tsx')
    expect(source).toContain("from:input[name='q']")
  })
})
