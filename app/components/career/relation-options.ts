import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerExperienceRecord,
  CareerProjectRecord,
  CareerPublicationRecord,
} from '../../../src/db/career-records'
import { dateRange } from './helpers'
import type { RelationOption } from './RelationPicker'

/**
 * Builds the option lists a `RelationPicker` offers. Callers pass only active,
 * usable records, so the picker never proposes an ineligible reference; the
 * value is always the stable id or key, never the mutable display name.
 */
export function experienceOptions(records: CareerExperienceRecord[]): RelationOption[] {
  return records.map((record) => ({
    value: String(record.id),
    label: `${record.role} — ${record.company}`,
    detail: dateRange(record),
  }))
}

export function catalogSkillOptions(records: CareerCatalogSkill[]): RelationOption[] {
  return records.map((record) => ({
    value: String(record.id),
    label: record.name,
    detail: record.category ?? undefined,
  }))
}

export function directionOptions(records: CareerDirectionRecord[]): RelationOption[] {
  return records.map((record) => ({ value: record.key, label: record.label }))
}

export function publicationOptions(records: CareerPublicationRecord[]): RelationOption[] {
  return records.map((record) => ({
    value: String(record.id),
    label: record.title,
    detail: String(record.year),
  }))
}

export function projectOptions(records: CareerProjectRecord[]): RelationOption[] {
  return records.map((record) => ({ value: String(record.id), label: record.name }))
}
