import { asc, eq } from 'drizzle-orm'
import { careerOnboardingRequired } from '../lib/application-readiness'
import { extensionObjectOrNull } from '../lib/career/json-schemas'
import { type CareerDirectionRecord, listCareerDirections } from './career-directions'
import { type CareerCandidateRecord, readCareerCandidate } from './career-facts'
import {
  type CareerAchievementRecord,
  type CareerEducationRecord,
  type CareerExperienceRecord,
  type CareerProjectRecord,
  type CareerPublicationRecord,
  listCareerAchievements,
  listCareerEducation,
  listCareerExperiences,
  listCareerProjects,
  listCareerPublications,
} from './career-records'
import { type CareerSkillRecord, listCareerSkills } from './career-skills'
import { type CareerStateExtensionRecords, readCareerStateDocuments } from './career-state'
import { db } from './client'
import { skills } from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Read model for the `/career-data` section. One loader serves the full page and
 * every section fragment, so the tab content, the retired-record filter and the
 * onboarding empty state always agree. Retired records stay readable (history is
 * never deleted) but only appear when the caller asks for them.
 */

/**
 * An approved catalog entry a personal skill may select. Only approved entries
 * are offered: a pending, rejected or merged catalog skill can never become a
 * personal skill, and the picker never creates a catalog entry.
 */
export type CareerCatalogSkill = {
  id: number
  key: string
  name: string
  category: string | null
}

export function listApprovedCatalogSkills(executor: DbExecutor = db): CareerCatalogSkill[] {
  return executor
    .select({ id: skills.id, key: skills.key, name: skills.name, category: skills.category })
    .from(skills)
    .where(eq(skills.reviewStatus, 'approved'))
    .orderBy(asc(skills.name))
    .all()
}

export type CareerDataView = {
  /** No candidate and no direction exist yet: show the onboarding empty state. */
  onboardingRequired: boolean
  candidate: CareerCandidateRecord | null
  /** Preserved identity fields that have no relational column. */
  candidateExtensions: Record<string, unknown> | null
  /** Preserved record extensions, by kind and stable key. */
  extensionRecords: CareerStateExtensionRecords
  education: CareerEducationRecord[]
  experiences: CareerExperienceRecord[]
  achievements: CareerAchievementRecord[]
  projects: CareerProjectRecord[]
  /** Personal ("My skills") records; retired ones only when requested. */
  personalSkills: CareerSkillRecord[]
  /** The approved catalog a personal skill or record link may select. */
  catalogSkills: CareerCatalogSkill[]
  /**
   * Active-only reference targets. A `RelationPicker` is only ever given these,
   * so a retired record can never be offered as a new link.
   */
  referenceExperiences: CareerExperienceRecord[]
  referenceDirections: CareerDirectionRecord[]
  referencePublications: CareerPublicationRecord[]
  /**
   * Every target, including retired history, so a link already stored on a
   * record still resolves to a name in the list.
   */
  allExperiences: CareerExperienceRecord[]
  allDirections: CareerDirectionRecord[]
  allPublications: CareerPublicationRecord[]
}

export function loadCareerDataView(
  executor: DbExecutor = db,
  options: { includeRetired?: boolean } = {},
): CareerDataView {
  const state = readCareerStateDocuments(executor)
  const allExperiences = listCareerExperiences(executor, { includeRetired: true })
  const allDirections = listCareerDirections(executor, { includeRetired: true })
  const allPublications = listCareerPublications(executor, { includeRetired: true })
  const activeOnly = <T extends { retiredAt: string | null }>(rows: T[]): T[] =>
    rows.filter((row) => row.retiredAt === null)
  const visible = <T extends { retiredAt: string | null }>(rows: T[]): T[] =>
    options.includeRetired ? rows : activeOnly(rows)
  return {
    onboardingRequired: careerOnboardingRequired(executor),
    candidate: readCareerCandidate(executor),
    candidateExtensions: extensionObjectOrNull(state.records.candidate?.['$']),
    extensionRecords: state.records,
    education: listCareerEducation(executor, { includeRetired: options.includeRetired }),
    experiences: visible(allExperiences),
    achievements: listCareerAchievements(executor, { includeRetired: options.includeRetired }),
    projects: listCareerProjects(executor, { includeRetired: options.includeRetired }),
    personalSkills: listCareerSkills(executor, { includeRetired: options.includeRetired }),
    catalogSkills: listApprovedCatalogSkills(executor),
    referenceExperiences: activeOnly(allExperiences),
    referenceDirections: activeOnly(allDirections),
    referencePublications: activeOnly(allPublications),
    allExperiences,
    allDirections,
    allPublications,
  }
}
