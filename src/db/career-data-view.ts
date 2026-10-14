import { careerOnboardingRequired } from '../lib/application-readiness'
import { extensionObjectOrNull } from '../lib/career/json-schemas'
import { type CareerCandidateRecord, readCareerCandidate } from './career-facts'
import {
  type CareerEducationRecord,
  type CareerExperienceRecord,
  listCareerEducation,
  listCareerExperiences,
} from './career-records'
import { type CareerStateExtensionRecords, readCareerStateDocuments } from './career-state'
import { db } from './client'
import type { DbExecutor } from './skill-queries'

/**
 * Read model for the `/career-data` section. One loader serves the full page and
 * every section fragment, so the tab content, the retired-record filter and the
 * onboarding empty state always agree. Retired records stay readable (history is
 * never deleted) but only appear when the caller asks for them.
 */
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
}

export function loadCareerDataView(
  executor: DbExecutor = db,
  options: { includeRetired?: boolean } = {},
): CareerDataView {
  const state = readCareerStateDocuments(executor)
  return {
    onboardingRequired: careerOnboardingRequired(executor),
    candidate: readCareerCandidate(executor),
    candidateExtensions: extensionObjectOrNull(state.records.candidate?.['$']),
    extensionRecords: state.records,
    education: listCareerEducation(executor, { includeRetired: options.includeRetired }),
    experiences: listCareerExperiences(executor, { includeRetired: options.includeRetired }),
  }
}
