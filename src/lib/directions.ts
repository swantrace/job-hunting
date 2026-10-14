import { listCareerDirections } from '../db/career-directions'
import { db } from '../db/client'
import type { DbExecutor } from '../db/skill-queries'

export type Direction = { id: string; label: string; targetTitles: string[] }

/**
 * Directions are defined solely by the `career_directions` table. Profiles no
 * longer exist; a direction is just an identity (id + label + target titles)
 * whose content comes from the selected approved Base Resume version. Retired
 * directions are omitted, and ordering is the stored display order (then label).
 */
export function listDirections(executor: DbExecutor = db): Direction[] {
  return listCareerDirections(executor)
    .slice()
    .sort(
      (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label),
    )
    .map((row) => ({
      id: row.key,
      label: row.label,
      targetTitles: row.targetTitles,
    }))
}

export function hasDirection(id: string, executor: DbExecutor = db): boolean {
  return listDirections(executor).some((direction) => direction.id === id)
}

export function directionLabel(id: string, executor: DbExecutor = db): string | undefined {
  return listDirections(executor).find((direction) => direction.id === id)?.label
}

export function directionTargetTitles(id: string, executor: DbExecutor = db): string[] {
  return listDirections(executor).find((direction) => direction.id === id)?.targetTitles ?? []
}
