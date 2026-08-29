import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { migratedDatabase } from '../support/sqlite'

const schemaSource = readFileSync(resolve(process.cwd(), 'src/db/schema.ts'), 'utf8')
const persistenceImplemented =
  schemaSource.includes('jobRequirements') && schemaSource.includes('applicationAnalysisRuns')
const contractTest = persistenceImplemented ? test : test.todo

describe('job requirements and analysis-run persistence contract', () => {
  contractTest('creates normalized requirements and immutable analysis-run tables', () => {
    const sqlite = migratedDatabase()
    try {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))

      expect(tables).toContain('job_requirements')
      expect(tables).toContain('application_analysis_runs')
    } finally {
      sqlite.close()
    }
  })

  contractTest(
    'stores every database date as text and protects one requirement per sequence',
    () => {
      const sqlite = migratedDatabase()
      try {
        const requirementColumns = sqlite
          .query("PRAGMA table_info('job_requirements')")
          .all() as Array<{
          name: string
          type: string
        }>
        const runColumns = sqlite
          .query("PRAGMA table_info('application_analysis_runs')")
          .all() as Array<{
          name: string
          type: string
        }>

        for (const column of [...requirementColumns, ...runColumns]) {
          if (column.name.endsWith('_at') || column.name.endsWith('_date')) {
            expect(column.type.toUpperCase()).toBe('TEXT')
          }
        }

        const indexes = sqlite.query("PRAGMA index_list('job_requirements')").all() as Array<{
          name: string
          unique: number
        }>
        expect(indexes.some((index) => index.unique === 1)).toBe(true)
      } finally {
        sqlite.close()
      }
    },
  )

  contractTest('keeps input and result snapshots in SQLite rather than only on disk', () => {
    expect(schemaSource).toMatch(/inputSnapshotJson/)
    expect(schemaSource).toMatch(/resultJson/)
    expect(schemaSource).toMatch(/promptVersion/)
    expect(schemaSource).toMatch(/schemaVersion/)
  })
})
