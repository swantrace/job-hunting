import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { assertDatabaseReady } from '../../src/db/health'
import { migratedDatabase } from '../support/sqlite'

describe('startup schema readiness', () => {
  test('passes on a fully migrated database', () => {
    const sqlite = migratedDatabase()
    try {
      expect(() => assertDatabaseReady(sqlite)).not.toThrow()
    } finally {
      sqlite.close()
    }
  })

  test('fails with a readable message when the schema is missing', () => {
    const sqlite = new Database(':memory:')
    try {
      expect(() => assertDatabaseReady(sqlite)).toThrow(/Run the database migrations/)
    } finally {
      sqlite.close()
    }
  })
})
