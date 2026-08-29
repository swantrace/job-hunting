import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const componentRoot = resolve(process.cwd(), 'app/components/workspace')
const routeRoot = resolve(process.cwd(), 'app/routes/applications/[id]')
const requiredFiles = [
  resolve(componentRoot, 'JobAnalysisSummary.tsx'),
  resolve(componentRoot, 'RequirementEvidenceMatrix.tsx'),
  resolve(componentRoot, 'ProfileRecommendation.tsx'),
  resolve(routeRoot, 'analysis-runs.tsx'),
]
const contractTest = requiredFiles.every(existsSync) ? test : test.todo

describe('LLM analysis review HTMX boundaries', () => {
  contractTest('uses stable nested review fragments without replacing the workspace shell', () => {
    const sources = requiredFiles.map((path) => readFileSync(path, 'utf8')).join('\n')
    const workspace = readFileSync(resolve(componentRoot, 'WorkspaceShell.tsx'), 'utf8')

    expect(sources).toContain('job-analysis-summary')
    expect(sources).toContain('requirement-evidence-matrix')
    expect(sources).toContain('profile-recommendation')
    expect(workspace).toContain('workspace-review-panel')
  })

  contractTest('shows an accessible queued or processing state for slow analysis calls', () => {
    const sources = requiredFiles.map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(sources).toMatch(/aria-live/)
    expect(sources).toMatch(/loading-spinner|loading-dots/)
    expect(sources).toMatch(/hx-trigger=.*delay|hx-get=.*analysis-runs/s)
  })

  contractTest('preserves the active Review tab and uses OOB updates for adjacent panels', () => {
    const route = readFileSync(resolve(routeRoot, 'analysis-runs.tsx'), 'utf8')

    expect(route).toContain('workspaceTab=review')
    expect(route).toMatch(/hx-swap-oob|Oob|OutOfBand/)
    expect(route).not.toMatch(/<AppShell|<html|<body/)
  })

  contractTest('uses current daisyUI 5 table and status patterns', () => {
    const matrix = readFileSync(resolve(componentRoot, 'RequirementEvidenceMatrix.tsx'), 'utf8')

    expect(matrix).toContain('overflow-x-auto')
    expect(matrix).toMatch(/class=["'{`][^\n]*table/)
    expect(matrix).not.toMatch(/form-control|input-bordered|select-bordered|textarea-bordered/)
  })
})
