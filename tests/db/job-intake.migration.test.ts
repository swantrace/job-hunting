import { describe, expect, test } from 'bun:test'
import { migratedDatabase } from '../support/sqlite'

describe('job intake migration', () => {
  test('creates batches and items with ordered status and reference columns', () => {
    const sqlite = migratedDatabase()
    try {
      const batches = sqlite.query("PRAGMA table_info('job_intake_batches')").all() as Array<{
        name: string
      }>
      expect(batches.map((column) => column.name)).toContain('id')

      const items = sqlite.query("PRAGMA table_info('job_intake_items')").all() as Array<{
        name: string
      }>
      const names = items.map((column) => column.name)
      for (const column of [
        'batch_id',
        'sequence',
        'kind',
        'raw',
        'normalized_url',
        'extracted_text',
        'status',
        'attempts',
        'error_message',
        'job_application_id',
        'job_posting_id',
      ]) {
        expect(names).toContain(column)
      }
    } finally {
      sqlite.close()
    }
  })

  test('passes foreign-key and integrity checks', () => {
    const sqlite = migratedDatabase()
    try {
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').all()).toEqual([{ integrity_check: 'ok' }])
    } finally {
      sqlite.close()
    }
  })
})
