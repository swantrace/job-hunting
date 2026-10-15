import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadCareerDataView } from '../../src/db/career-data-view'
import { saveCareerCandidate } from '../../src/db/career-facts'
import {
  createCareerEducation,
  createCareerExperience,
  listCareerEducation,
  listCareerExperiences,
  moveCareerEducation,
  moveCareerExperience,
  restoreCareerEducation,
  retireCareerEducation,
  retireCareerExperience,
} from '../../src/db/career-records'
import { careerContentProbe } from '../../src/db/career-shared'
import * as schema from '../../src/db/schema'
import { storedRecordExtensions, writeRecordExtensions } from '../../src/lib/career/extensions'
import {
  applyExtensionFields,
  candidateFormSchema,
  careerDateError,
  careerStableKey,
  educationFormSchema,
  experienceFormSchema,
  formatExtensionLines,
  parseExtensionLines,
  resolveFieldValue,
} from '../../src/lib/career/form-input'
import { truthfulnessView } from '../../src/lib/career/json-schemas'
import { loadCareerDataFromDatabase } from '../../src/lib/career-data'
import { migratedDatabase } from '../support/sqlite'

/**
 * Step 7 data contracts for career identity, experience and education: the
 * section read model (including the empty-database onboarding state), precision
 * validation, generated stable keys, order moves, retirement visibility and
 * extension-field editing without raw JSON. Every database here is an in-memory
 * database migrated from `drizzle/`, never the developer's `jobs.db`.
 */
function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

const candidate = {
  fullName: 'Fixture Candidate',
  authorization: { workAuthorization: 'Citizen', requiresSponsorship: false, notes: null },
  careerBreak: {
    hasBreak: true,
    startDate: '2024-02',
    endDate: '2024-06',
    datePrecision: 'month' as const,
    reason: 'Caregiving.',
  },
  truthfulness: {
    neverClaimUnexperiencedSkill: true,
    requireAccurateDates: true,
    notes: null,
  },
}

describe('career data read model', () => {
  test('an empty database requires onboarding and has no facts', () => {
    const { sqlite, db } = database()
    try {
      const view = loadCareerDataView(db)
      expect(view.onboardingRequired).toBe(true)
      expect(view.candidate).toBeNull()
      expect(view.candidateExtensions).toBeNull()
      expect(view.education).toEqual([])
      expect(view.experiences).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('a saved identity ends onboarding and reloads with every preserved field', () => {
    const { sqlite, db } = database()
    try {
      saveCareerCandidate(db, candidate)
      const view = loadCareerDataView(db)
      expect(view.onboardingRequired).toBe(false)
      expect(view.candidate?.fullName).toBe('Fixture Candidate')
      expect(view.candidate?.careerBreak?.datePrecision).toBe('month')
      expect(view.candidate?.careerBreak?.startDate).toBe('2024-02')
      expect(view.candidate?.authorization?.requiresSponsorship).toBe(false)
      expect(truthfulnessView(view.candidate?.truthfulness).flags?.requireAccurateDates).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  test('retired records leave the default view and the runtime career data, but keep history', () => {
    const { sqlite, db } = database()
    try {
      saveCareerCandidate(db, candidate)
      const experience = createCareerExperience(db, {
        stableKey: 'fixture-experience',
        company: 'Fixture Co',
        role: 'Engineer',
      })
      const education = createCareerEducation(db, {
        stableKey: 'fixture-education',
        degree: 'BSc',
        school: 'Fixture Institute',
      })

      retireCareerExperience(db, experience.id)
      retireCareerEducation(db, education.id)

      const view = loadCareerDataView(db)
      expect(view.experiences).toEqual([])
      expect(view.education).toEqual([])
      // History is preserved: the rows are still readable in the retired view.
      expect(listCareerExperiences(db, { includeRetired: true })).toHaveLength(1)
      expect(listCareerEducation(db, { includeRetired: true })).toHaveLength(1)
      // New documents can no longer use them.
      expect(loadCareerDataFromDatabase(db).experiences.experiences).toEqual([])
      expect(loadCareerDataFromDatabase(db).candidate.education).toEqual([])

      restoreCareerEducation(db, education.id)
      expect(loadCareerDataView(db).education).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })
})

describe('career order moves', () => {
  test('moves one record past its visible neighbour and no-ops at the ends', () => {
    const { sqlite, db } = database()
    try {
      const first = createCareerExperience(db, {
        stableKey: 'first',
        company: 'First',
        role: 'Engineer',
      })
      const second = createCareerExperience(db, {
        stableKey: 'second',
        company: 'Second',
        role: 'Engineer',
      })
      const third = createCareerEducation(db, {
        stableKey: 'third',
        degree: 'BSc',
        school: 'Three',
      })
      const fourth = createCareerEducation(db, {
        stableKey: 'fourth',
        degree: 'MSc',
        school: 'Four',
      })

      expect(listCareerExperiences(db).map((row) => row.stableKey)).toEqual(['first', 'second'])
      expect(moveCareerExperience(db, first.id, 'up').changed).toBe(false)
      expect(moveCareerExperience(db, second.id, 'up').changed).toBe(true)
      expect(listCareerExperiences(db).map((row) => row.stableKey)).toEqual(['second', 'first'])
      expect(moveCareerExperience(db, second.id, 'down')).toMatchObject({ changed: true })
      expect(listCareerExperiences(db).map((row) => row.stableKey)).toEqual(['first', 'second'])

      expect(moveCareerEducation(db, fourth.id, 'up')).toMatchObject({ changed: true })
      expect(listCareerEducation(db).map((row) => row.stableKey)).toEqual(['fourth', 'third'])
      expect(moveCareerEducation(db, fourth.id, 'up').changed).toBe(false)
      expect(moveCareerEducation(db, third.id, 'down').changed).toBe(false)
    } finally {
      sqlite.close()
    }
  })

  test('a retired record moves among retired rows only', () => {
    const { sqlite, db } = database()
    try {
      const active = createCareerEducation(db, { stableKey: 'a', degree: 'A', school: 'A' })
      const retired = createCareerEducation(db, { stableKey: 'b', degree: 'B', school: 'B' })
      createCareerEducation(db, { stableKey: 'c', degree: 'C', school: 'C' })
      retireCareerEducation(db, retired.id)

      // Moving the first active record cannot step over a hidden retired row.
      expect(moveCareerEducation(db, active.id, 'up').changed).toBe(false)
      expect(listCareerEducation(db).map((row) => row.stableKey)).toEqual(['a', 'c'])
      expect(listCareerEducation(db, { includeRetired: true })).toHaveLength(3)
    } finally {
      sqlite.close()
    }
  })
})

describe('career form input', () => {
  test('date precision is validated instead of inventing a day or a month', () => {
    expect(careerDateError('2024-02', 'month')).toBeNull()
    expect(careerDateError('2024-02-29', 'day')).toBeNull()
    expect(careerDateError('2024-02-30', 'day')).toContain('real calendar day')
    expect(careerDateError('2024-02-01', 'month')).toContain('YYYY-MM')
    expect(careerDateError('2024-02', 'year')).toContain('YYYY')
    expect(careerDateError('1899', 'year')).toContain('1900')

    const monthPrecision = experienceFormSchema.safeParse({
      company: 'Co',
      role: 'Engineer',
      startDate: '2024-02',
      datePrecision: 'month',
    })
    expect(monthPrecision.success).toBe(true)
    expect(
      experienceFormSchema.safeParse({
        company: 'Co',
        role: 'Engineer',
        startDate: '2024-02',
        datePrecision: 'day',
      }).success,
    ).toBe(false)
    expect(
      educationFormSchema.safeParse({
        degree: 'BSc',
        school: 'School',
        endDate: '2024-02-30',
        datePrecision: 'day',
      }).success,
    ).toBe(false)
  })

  test('career break dates are rejected until a break is explicitly recorded', () => {
    const recorded = candidateFormSchema.safeParse({
      fullName: 'Fixture',
      hasCareerBreak: 'yes',
      careerBreakStartDate: '2024-02',
      careerBreakPrecision: 'month',
    })
    expect(recorded.success).toBe(true)
    expect(
      candidateFormSchema.safeParse({
        fullName: 'Fixture',
        hasCareerBreak: '',
        careerBreakStartDate: '2024-02',
      }).success,
    ).toBe(false)
    expect(
      candidateFormSchema.safeParse({
        fullName: 'Fixture',
        hasCareerBreak: 'no',
        careerBreakReason: 'Not applicable',
      }).success,
    ).toBe(false)
  })

  test('generated stable keys are readable and unique', () => {
    const first = careerStableKey(['Northwind Analytics', 'Senior Developer'], [])
    const second = careerStableKey(['Northwind Analytics', 'Senior Developer'], [first])
    expect(first).toBe('northwind-analytics-senior-developer')
    expect(second).toBe(`${first}-2`)
    expect(careerStableKey(['', null], [])).toBe('record')
  })

  test('extension fields edit as key = value text and keep untouched JSON values', () => {
    const preserved = { count: 3, flag: true, note: 'kept', nested: { a: 1 } }
    const lines = formatExtensionLines(preserved)
    expect(lines).toBe('count = 3\nflag = true\nnote = kept\nnested = {"a":1}')

    // Re-saving the rendered text keeps every original type.
    expect(parseExtensionLines(preserved, lines)).toEqual(preserved)
    // An edited value becomes text; a removed line removes the field.
    expect(parseExtensionLines(preserved, 'count = 4')).toEqual({ count: '4' })
    expect(parseExtensionLines(preserved, '')).toBeNull()
    expect(
      applyExtensionFields({ education: { one: { a: 1 } } }, 'education', 'one', null),
    ).toEqual({})
  })

  test('an untouched detail keeps its stored shape while an edit stores text', () => {
    const current = { a: 1 }
    expect(resolveFieldValue(current, '{"a":1}')).toEqual(current)
    expect(resolveFieldValue(current, 'plain text')).toBe('plain text')
    expect(resolveFieldValue(current, '')).toBeNull()
    expect(resolveFieldValue('kept', 'kept')).toBe('kept')
  })

  test('preserved extension fields round trip through the owning education row', () => {
    const { sqlite, db } = database()
    try {
      createCareerEducation(db, {
        stableKey: 'fixture-education',
        degree: 'BSc',
        school: 'Example Institute',
      })
      expect(storedRecordExtensions(db, 'education', 'fixture-education')).toBeNull()

      // An object value round-trips through the row's column with its JSON
      // types intact, matching what the importer writes.
      expect(writeRecordExtensions(db, 'education', 'fixture-education', { preserved: 7 })).toBe(
        true,
      )
      expect(storedRecordExtensions(db, 'education', 'fixture-education')).toEqual({ preserved: 7 })

      // An emptied extension removes the field from the row instead of leaving
      // an empty object behind.
      expect(writeRecordExtensions(db, 'education', 'fixture-education', null)).toBe(true)
      expect(storedRecordExtensions(db, 'education', 'fixture-education')).toBeNull()
      expect(
        sqlite
          .query(
            "SELECT extension_json FROM career_education WHERE stable_key = 'fixture-education'",
          )
          .get(),
      ).toEqual({ extension_json: null })
    } finally {
      sqlite.close()
    }
  })
})

describe('no-op writes stay invisible', () => {
  test('re-saving identical identity content keeps the change probe', () => {
    const { sqlite, db } = database()
    try {
      saveCareerCandidate(db, candidate)
      const before = careerContentProbe(db)
      expect(saveCareerCandidate(db, candidate)).toMatchObject({ changed: false })
      expect(careerContentProbe(db)).toBe(before)
    } finally {
      sqlite.close()
    }
  })
})
