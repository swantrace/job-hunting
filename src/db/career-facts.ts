import { eq } from 'drizzle-orm'
import {
  type Authorization,
  authorizationSchema,
  type CareerBreak,
  type Compensation,
  careerBreakSchema,
  compensationSchema,
  parseJsonColumn,
  serializeJsonColumn,
  stringListSchema,
  type TruthfulnessRules,
  truthfulnessSchema,
} from '../lib/career/json-schemas'
import { nowISO } from '../lib/date'
import {
  assertExpectedRevision,
  type CareerDb,
  type CareerSaveResult,
  recordCareerChange,
  stableFingerprint,
} from './career-state'
import { db } from './client'
import {
  type CareerCandidate,
  type CareerPreferences,
  careerCandidate,
  careerPreferences,
} from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Candidate identity and career preferences are singletons: the database owns
 * exactly one candidate and one preference row, written only through these
 * functions. JSON columns are validated with loose schemas, so unknown
 * extension keys round trip untouched.
 */

export type CareerCandidateRecord = Omit<
  CareerCandidate,
  'authorizationJson' | 'careerBreakJson' | 'truthfulnessJson'
> & {
  authorization: Authorization | null
  careerBreak: CareerBreak | null
  truthfulness: TruthfulnessRules | null
}

export type CareerCandidateInput = {
  fullName: string
  email?: string | null
  phone?: string | null
  location?: string | null
  website?: string | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  authorization?: Authorization | null
  careerBreak?: CareerBreak | null
  truthfulness?: TruthfulnessRules | null
}

export type CareerPreferencesRecord = Omit<
  CareerPreferences,
  'locationsJson' | 'workModesJson' | 'compensationJson'
> & {
  locations: string[]
  workModes: string[]
  compensation: Compensation | null
}

export type CareerPreferencesInput = {
  locations?: string[]
  workModes?: string[]
  availability?: string | null
  compensation?: Compensation | null
  notes?: string | null
}

function candidateContent(source: CareerCandidateInput | CareerCandidateRecord) {
  return {
    fullName: source.fullName,
    email: source.email ?? null,
    phone: source.phone ?? null,
    location: source.location ?? null,
    website: source.website ?? null,
    linkedinUrl: source.linkedinUrl ?? null,
    githubUrl: source.githubUrl ?? null,
    authorization: source.authorization ?? null,
    careerBreak: source.careerBreak ?? null,
    truthfulness: source.truthfulness ?? null,
  }
}

function candidateColumns(content: ReturnType<typeof candidateContent>) {
  const { fullName, authorization, careerBreak, truthfulness, ...contact } = content
  if (fullName.trim() === '') throw new Error('Candidate full name is required.')
  return {
    fullName: fullName.trim(),
    email: contact.email,
    phone: contact.phone,
    location: contact.location,
    website: contact.website,
    linkedinUrl: contact.linkedinUrl,
    githubUrl: contact.githubUrl,
    authorizationJson:
      authorization === null ? null : serializeJsonColumn(authorizationSchema.parse(authorization)),
    careerBreakJson:
      careerBreak === null ? null : serializeJsonColumn(careerBreakSchema.parse(careerBreak)),
    truthfulnessJson:
      truthfulness === null ? null : serializeJsonColumn(truthfulnessSchema.parse(truthfulness)),
  }
}

function candidateToRecord(row: CareerCandidate): CareerCandidateRecord {
  return {
    ...row,
    authorization: parseJsonColumn(
      row.authorizationJson,
      authorizationSchema,
      null,
      'career_candidate.authorization_json',
    ),
    careerBreak: parseJsonColumn(
      row.careerBreakJson,
      careerBreakSchema,
      null,
      'career_candidate.career_break_json',
    ),
    truthfulness: parseJsonColumn(
      row.truthfulnessJson,
      truthfulnessSchema,
      null,
      'career_candidate.truthfulness_json',
    ),
  }
}

export function readCareerCandidate(executor: DbExecutor = db): CareerCandidateRecord | null {
  const row = executor.select().from(careerCandidate).where(eq(careerCandidate.id, 1)).get()
  return row ? candidateToRecord(row) : null
}

export function saveCareerCandidate(
  executor: CareerDb,
  input: CareerCandidateInput,
  options: { expectedRevision?: number } = {},
): CareerSaveResult {
  return executor.transaction((tx) => {
    const existing =
      tx.select().from(careerCandidate).where(eq(careerCandidate.id, 1)).get() ?? null
    assertExpectedRevision(
      'career_candidate',
      'candidate',
      options.expectedRevision,
      existing?.revision ?? 0,
    )
    const content = candidateContent(input)
    if (
      existing &&
      stableFingerprint(content) ===
        stableFingerprint(candidateContent(candidateToRecord(existing)))
    ) {
      return { changed: false, revision: existing.revision }
    }
    const revision = existing ? existing.revision + 1 : 1
    const now = nowISO()
    const columns = candidateColumns(content)
    if (existing) {
      tx.update(careerCandidate)
        .set({ ...columns, revision, updatedAt: now })
        .where(eq(careerCandidate.id, 1))
        .run()
    } else {
      tx.insert(careerCandidate)
        .values({ id: 1, ...columns, revision, createdAt: now, updatedAt: now })
        .run()
    }
    recordCareerChange(tx, stableFingerprint(content))
    return { changed: true, revision }
  })
}

function preferencesContent(source: CareerPreferencesInput | CareerPreferencesRecord) {
  return {
    locations: source.locations ?? [],
    workModes: source.workModes ?? [],
    availability: source.availability ?? null,
    compensation: source.compensation ?? null,
    notes: source.notes ?? null,
  }
}

function preferencesColumns(content: ReturnType<typeof preferencesContent>) {
  return {
    locationsJson: serializeJsonColumn(stringListSchema.parse(content.locations)),
    workModesJson: serializeJsonColumn(stringListSchema.parse(content.workModes)),
    availability: content.availability,
    compensationJson:
      content.compensation === null
        ? null
        : serializeJsonColumn(compensationSchema.parse(content.compensation)),
    notes: content.notes,
  }
}

function preferencesToRecord(row: CareerPreferences): CareerPreferencesRecord {
  return {
    ...row,
    locations: parseJsonColumn(
      row.locationsJson,
      stringListSchema,
      [],
      'career_preferences.locations_json',
    ),
    workModes: parseJsonColumn(
      row.workModesJson,
      stringListSchema,
      [],
      'career_preferences.work_modes_json',
    ),
    compensation: parseJsonColumn(
      row.compensationJson,
      compensationSchema,
      null,
      'career_preferences.compensation_json',
    ),
  }
}

export function readCareerPreferences(executor: DbExecutor = db): CareerPreferencesRecord | null {
  const row = executor.select().from(careerPreferences).where(eq(careerPreferences.id, 1)).get()
  return row ? preferencesToRecord(row) : null
}

export function saveCareerPreferences(
  executor: CareerDb,
  input: CareerPreferencesInput,
  options: { expectedRevision?: number } = {},
): CareerSaveResult {
  return executor.transaction((tx) => {
    const existing =
      tx.select().from(careerPreferences).where(eq(careerPreferences.id, 1)).get() ?? null
    assertExpectedRevision(
      'career_preferences',
      'preferences',
      options.expectedRevision,
      existing?.revision ?? 0,
    )
    const content = preferencesContent(input)
    if (
      existing &&
      stableFingerprint(content) ===
        stableFingerprint(preferencesContent(preferencesToRecord(existing)))
    ) {
      return { changed: false, revision: existing.revision }
    }
    const revision = existing ? existing.revision + 1 : 1
    const now = nowISO()
    const columns = preferencesColumns(content)
    if (existing) {
      tx.update(careerPreferences)
        .set({ ...columns, revision, updatedAt: now })
        .where(eq(careerPreferences.id, 1))
        .run()
    } else {
      tx.insert(careerPreferences)
        .values({ id: 1, ...columns, revision, createdAt: now, updatedAt: now })
        .run()
    }
    recordCareerChange(tx, stableFingerprint(content))
    return { changed: true, revision }
  })
}
