import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  readCareerCandidate,
  readCareerPreferences,
  saveCareerCandidate,
  saveCareerPreferences,
} from '../../src/db/career-facts'
import { CareerRevisionConflictError } from '../../src/db/career-shared'
import * as schema from '../../src/db/schema'
import { migratedDatabase } from '../support/sqlite'

function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

describe('career_profile singleton', () => {
  test('round-trips both halves through one row without clobbering either', () => {
    const { sqlite, db } = database()
    try {
      expect(readCareerCandidate(db)).toBeNull()
      expect(readCareerPreferences(db)).toBeNull()

      expect(
        saveCareerCandidate(db, { fullName: 'Jordan Rivera', email: 'jordan@example.test' }),
      ).toEqual({ changed: true, revision: 1 })
      // A row now exists, so the preferences half reads its stored defaults.
      expect(readCareerPreferences(db)?.locations).toEqual([])

      expect(
        saveCareerPreferences(db, {
          locations: ['Edmonton, AB'],
          workModes: ['remote'],
          availability: 'Two weeks notice',
        }),
      ).toEqual({ changed: true, revision: 2 })
      // The preferences save left the identity columns alone.
      expect(readCareerCandidate(db)?.fullName).toBe('Jordan Rivera')
      expect(readCareerCandidate(db)?.email).toBe('jordan@example.test')

      // A later identity save leaves the preference columns alone.
      expect(saveCareerCandidate(db, { fullName: 'Jordan R. Rivera' })).toEqual({
        changed: true,
        revision: 3,
      })
      expect(readCareerPreferences(db)?.locations).toEqual(['Edmonton, AB'])
      expect(readCareerPreferences(db)?.availability).toBe('Two weeks notice')

      expect(sqlite.query('SELECT count(*) AS count FROM career_profile').get()).toEqual({
        count: 1,
      })
    } finally {
      sqlite.close()
    }
  })

  test('a no-op save of either half reports changed false', () => {
    const { sqlite, db } = database()
    try {
      saveCareerCandidate(db, { fullName: 'Jordan Rivera' })
      saveCareerPreferences(db, { locations: ['Edmonton, AB'] })

      expect(saveCareerCandidate(db, { fullName: 'Jordan Rivera' })).toEqual({
        changed: false,
        revision: 2,
      })
      expect(
        saveCareerPreferences(db, {
          locations: ['Edmonton, AB'],
          workModes: [],
          availability: null,
        }),
      ).toEqual({ changed: false, revision: 2 })
      expect(sqlite.query('SELECT revision FROM career_profile').get()).toEqual({ revision: 2 })
    } finally {
      sqlite.close()
    }
  })

  test('a preferences-first save still lets the identity form save at revision 0', () => {
    const { sqlite, db } = database()
    try {
      expect(saveCareerPreferences(db, { locations: ['Edmonton, AB'] })).toEqual({
        changed: true,
        revision: 1,
      })
      // The identity half is absent, so its form renders revision 0 ...
      expect(readCareerCandidate(db)).toBeNull()
      // ... and that baseline is accepted rather than conflicting with the row.
      expect(
        saveCareerCandidate(db, { fullName: 'Jordan Rivera' }, { expectedRevision: 0 }),
      ).toEqual({ changed: true, revision: 2 })
      expect(readCareerCandidate(db)?.fullName).toBe('Jordan Rivera')
      expect(readCareerPreferences(db)?.locations).toEqual(['Edmonton, AB'])
    } finally {
      sqlite.close()
    }
  })

  test('a stale expectedRevision conflicts because both halves share one revision', () => {
    const { sqlite, db } = database()
    try {
      saveCareerCandidate(db, { fullName: 'Jordan Rivera' })
      // A preferences save bumps the shared revision ...
      saveCareerPreferences(db, { locations: ['Edmonton, AB'] })

      // ... so a candidate form still carrying revision 1 must conflict.
      expect(() =>
        saveCareerCandidate(db, { fullName: 'Jordan Rivera' }, { expectedRevision: 1 }),
      ).toThrow(CareerRevisionConflictError)
      expect(() =>
        saveCareerPreferences(db, { locations: ['Elsewhere'] }, { expectedRevision: 1 }),
      ).toThrow(CareerRevisionConflictError)
      // A matching revision is accepted.
      expect(
        saveCareerPreferences(db, { locations: ['Elsewhere'] }, { expectedRevision: 2 }),
      ).toEqual({ changed: true, revision: 3 })
    } finally {
      sqlite.close()
    }
  })
})
