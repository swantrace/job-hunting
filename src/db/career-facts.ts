import { eq } from 'drizzle-orm'
import {
  type Authorization,
  authorizationSchema,
  type CareerBreak,
  type Compensation,
  careerBreakSchema,
  compensationSchema,
  parseJsonColumn,
  parseJsonValue,
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
  stableFingerprint,
} from './career-shared'
import { db } from './client'
import { type CareerProfile, careerProfile } from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Candidate identity and career preferences share the single `career_profile`
 * row (migration 0027 folded the two old singletons into one). Each half is
 * written through its own function and only ever touches its own columns, so a
 * preferences save never clobbers the identity and vice versa.
 *
 * Both halves share one `revision`, so a save of either half bumps the counter
 * the other half's form carries: a stale form of either half still conflicts
 * through `expectedRevision`. JSON columns are validated with loose schemas, so
 * unknown extension keys round trip untouched.
 */

export type CareerCandidateRecord = {
  id: number
  fullName: string
  email: string | null
  phone: string | null
  location: string | null
  website: string | null
  linkedinUrl: string | null
  githubUrl: string | null
  revision: number
  createdAt: string
  updatedAt: string
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

export type CareerPreferencesRecord = {
  id: number
  locations: string[]
  workModes: string[]
  availability: string | null
  compensation: Compensation | null
  notes: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export type CareerPreferencesInput = {
  locations?: string[]
  workModes?: string[]
  availability?: string | null
  compensation?: Compensation | null
  notes?: string | null
}

function readProfileRow(executor: DbExecutor): CareerProfile | null {
  return executor.select().from(careerProfile).where(eq(careerProfile.id, 1)).get() ?? null
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
      authorization === null
        ? null
        : serializeJsonColumn(
            parseJsonValue(authorization, authorizationSchema, 'career_profile.authorization_json'),
          ),
    careerBreakJson:
      careerBreak === null
        ? null
        : serializeJsonColumn(
            parseJsonValue(careerBreak, careerBreakSchema, 'career_profile.career_break_json'),
          ),
    truthfulnessJson:
      truthfulness === null
        ? null
        : serializeJsonColumn(
            parseJsonValue(truthfulness, truthfulnessSchema, 'career_profile.truthfulness_json'),
          ),
  }
}

function candidateToRecord(row: CareerProfile): CareerCandidateRecord {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    location: row.location,
    website: row.website,
    linkedinUrl: row.linkedinUrl,
    githubUrl: row.githubUrl,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    authorization: parseJsonColumn(
      row.authorizationJson,
      authorizationSchema,
      null,
      'career_profile.authorization_json',
    ),
    careerBreak: parseJsonColumn(
      row.careerBreakJson,
      careerBreakSchema,
      null,
      'career_profile.career_break_json',
    ),
    truthfulness: parseJsonColumn(
      row.truthfulnessJson,
      truthfulnessSchema,
      null,
      'career_profile.truthfulness_json',
    ),
  }
}

/**
 * The candidate half is "present" only once an identity has been saved; its
 * `full_name` is the discriminator because a candidate save always requires a
 * non-empty name while a preferences-only row keeps the empty default. While
 * the half is unset its effective revision is 0, matching what its form renders.
 */
export function readCareerCandidate(executor: DbExecutor = db): CareerCandidateRecord | null {
  const row = readProfileRow(executor)
  return row && row.fullName !== '' ? candidateToRecord(row) : null
}

export function saveCareerCandidate(
  executor: CareerDb,
  input: CareerCandidateInput,
  options: { expectedRevision?: number } = {},
): CareerSaveResult {
  return executor.transaction((tx) => {
    const existing = readProfileRow(tx)
    // A preferences-only row already carries the shared revision, but the
    // identity form still reports revision 0, so compare against the half's own
    // baseline until an identity exists.
    const candidateRevision = existing && existing.fullName !== '' ? existing.revision : 0
    assertExpectedRevision(
      'career_profile',
      'candidate',
      options.expectedRevision,
      candidateRevision,
    )
    const content = candidateContent(input)
    if (
      existing &&
      existing.fullName !== '' &&
      stableFingerprint(content) ===
        stableFingerprint(candidateContent(candidateToRecord(existing)))
    ) {
      return { changed: false, revision: existing.revision }
    }
    const revision = existing ? existing.revision + 1 : 1
    const now = nowISO()
    const columns = candidateColumns(content)
    if (existing) {
      tx.update(careerProfile)
        .set({ ...columns, revision, updatedAt: now })
        .where(eq(careerProfile.id, 1))
        .run()
    } else {
      tx.insert(careerProfile)
        .values({ id: 1, ...columns, revision, createdAt: now, updatedAt: now })
        .run()
    }
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
    locationsJson: serializeJsonColumn(
      parseJsonValue(content.locations, stringListSchema, 'career_profile.locations_json'),
    ),
    workModesJson: serializeJsonColumn(
      parseJsonValue(content.workModes, stringListSchema, 'career_profile.work_modes_json'),
    ),
    availability: content.availability,
    compensationJson:
      content.compensation === null
        ? null
        : serializeJsonColumn(
            parseJsonValue(
              content.compensation,
              compensationSchema,
              'career_profile.compensation_json',
            ),
          ),
    notes: content.notes,
  }
}

function preferencesToRecord(row: CareerProfile): CareerPreferencesRecord {
  return {
    id: row.id,
    locations: parseJsonColumn(
      row.locationsJson,
      stringListSchema,
      [],
      'career_profile.locations_json',
    ),
    workModes: parseJsonColumn(
      row.workModesJson,
      stringListSchema,
      [],
      'career_profile.work_modes_json',
    ),
    availability: row.availability,
    compensation: parseJsonColumn(
      row.compensationJson,
      compensationSchema,
      null,
      'career_profile.compensation_json',
    ),
    notes: row.notes,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function readCareerPreferences(executor: DbExecutor = db): CareerPreferencesRecord | null {
  const row = readProfileRow(executor)
  return row ? preferencesToRecord(row) : null
}

export function saveCareerPreferences(
  executor: CareerDb,
  input: CareerPreferencesInput,
  options: { expectedRevision?: number } = {},
): CareerSaveResult {
  return executor.transaction((tx) => {
    const existing = readProfileRow(tx)
    assertExpectedRevision(
      'career_profile',
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
      tx.update(careerProfile)
        .set({ ...columns, revision, updatedAt: now })
        .where(eq(careerProfile.id, 1))
        .run()
    } else {
      tx.insert(careerProfile)
        .values({ id: 1, ...columns, revision, createdAt: now, updatedAt: now })
        .run()
    }
    return { changed: true, revision }
  })
}
