import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { assertDatabaseReady } from '../../src/db/health'
import { migratedDatabase } from '../support/sqlite'

describe('startup schema readiness', () => {
  test('requires the durable analysis workflow outbox', () => {
    const sqlite = migratedDatabase()
    try {
      sqlite.exec('DROP TABLE analysis_workflows')
      expect(() => assertDatabaseReady(sqlite)).toThrow('analysis_workflows')
    } finally {
      sqlite.close()
    }
  })
  test('requires the durable batch analysis table', () => {
    const sqlite = migratedDatabase()
    try {
      sqlite.exec('DROP TABLE batch_analysis_items')
      expect(() => assertDatabaseReady(sqlite)).toThrow('batch_analysis_items')
    } finally {
      sqlite.close()
    }
  })
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

  test('names the missing career table and the migration command', () => {
    const sqlite = migratedDatabase()
    try {
      sqlite.exec('DROP TABLE career_record_directions')
      let message = ''
      try {
        assertDatabaseReady(sqlite)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).toContain('career_record_directions')
      expect(message).toContain('bun run db:migrate')
    } finally {
      sqlite.close()
    }
  })

  test('a migrated but empty career database is ready', () => {
    const sqlite = migratedDatabase()
    try {
      expect(() => assertDatabaseReady(sqlite)).not.toThrow()
      expect(
        sqlite.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'career_profile'").get(),
      ).toEqual({ n: 1 })
    } finally {
      sqlite.close()
    }
  })
})
