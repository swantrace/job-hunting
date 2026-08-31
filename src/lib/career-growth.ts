/**
 * Career growth is a derived read model, never a mutable copy of private Career
 * Data. This module holds the pure ranking and labelling logic: deduplication by
 * canonical skill, deterministic scoring, neutral labels, and the active-status
 * gate that excludes Archived and Rejected work.
 */

import { activeStatuses, type JobStatus } from './applications/constants'

export const careerGrowthLabels = [
  'Verify existing evidence',
  'Consider learning/project evidence',
  'Low priority',
] as const
export type CareerGrowthLabel = (typeof careerGrowthLabels)[number]

export type CareerGrowthInputRow = {
  /** Canonical skill key (identity), never a display label. */
  skillKey: string
  skillName: string
  /** Distinct directions the skill appeared under. */
  directionCount: number
  /** Distinct active applications the skill appeared in. */
  activeApplicationCount: number
  requiredCount: number
  preferredCount: number
  mentionedCount: number
  /** Requirements with direct or transferable evidence. */
  verifiedEvidenceCount: number
  /** User Include decisions retaining this opportunity. */
  retainedCount: number
  /** Most recent activity date across contributing applications (ISO date). */
  latestActivityAt: string
}

export type CareerGrowthOpportunity = CareerGrowthInputRow & {
  score: number
  label: CareerGrowthLabel
}

export function isActiveApplicationStatus(status: string): boolean {
  return (activeStatuses as readonly string[]).includes(status)
}

/**
 * Default exclusions are Archived and Rejected; other statuses are active.
 */
export function isCareerGrowthEligibleStatus(status: string): boolean {
  return isActiveApplicationStatus(status)
}

export const requiredWeight = 3
export const preferredWeight = 2
export const mentionedWeight = 1

function importanceScore(row: CareerGrowthInputRow): number {
  return (
    row.requiredCount * requiredWeight +
    row.preferredCount * preferredWeight +
    row.mentionedCount * mentionedWeight
  )
}

/**
 * Deterministic score: recurring active-application frequency dominates, then
 * requirement importance, direction relevance, and user retention. Include
 * reasons are context only and never proof, so they add no score weight.
 */
export function careerGrowthScore(row: CareerGrowthInputRow): number {
  return (
    row.activeApplicationCount * 10 +
    importanceScore(row) +
    row.retainedCount * 2 +
    row.directionCount
  )
}

export function careerGrowthLabelFor(row: CareerGrowthInputRow): CareerGrowthLabel {
  if (row.requiredCount === 0 && row.preferredCount === 0) return 'Low priority'
  if (row.verifiedEvidenceCount > 0) return 'Verify existing evidence'
  return 'Consider learning/project evidence'
}

/**
 * Groups already-projected rows by canonical skill and ranks them
 * deterministically. Rows for the same skill are merged (counts summed, most
 * recent activity kept) so a skill appears exactly once.
 */
export function rankCareerGrowthOpportunities(
  rows: CareerGrowthInputRow[],
): CareerGrowthOpportunity[] {
  const byKey = new Map<string, CareerGrowthInputRow>()
  for (const row of rows) {
    if (row.activeApplicationCount <= 0) continue
    const existing = byKey.get(row.skillKey)
    if (!existing) {
      byKey.set(row.skillKey, { ...row })
      continue
    }
    existing.skillName = existing.skillName || row.skillName
    existing.directionCount = Math.max(existing.directionCount, row.directionCount)
    existing.activeApplicationCount = Math.max(
      existing.activeApplicationCount,
      row.activeApplicationCount,
    )
    existing.requiredCount += row.requiredCount
    existing.preferredCount += row.preferredCount
    existing.mentionedCount += row.mentionedCount
    existing.verifiedEvidenceCount += row.verifiedEvidenceCount
    existing.retainedCount += row.retainedCount
    existing.latestActivityAt =
      row.latestActivityAt > existing.latestActivityAt
        ? row.latestActivityAt
        : existing.latestActivityAt
  }
  return [...byKey.values()]
    .map((row) => ({ ...row, score: careerGrowthScore(row), label: careerGrowthLabelFor(row) }))
    .sort((left, right) => right.score - left.score || left.skillKey.localeCompare(right.skillKey))
}

export { type JobStatus }
