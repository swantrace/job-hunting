import { loadCareerData } from './career-data'

export type Direction = { id: string; label: string; targetTitles: string[] }

/**
 * Directions are defined solely by `preferences.directionDefinitions`. Profiles
 * no longer exist; a direction is just an identity (id + label + target titles)
 * whose content comes from an optional approved Base Resume.
 */
export function listDirections(): Direction[] {
  const data = loadCareerData()
  return Object.entries(data.preferences.directionDefinitions)
    .map(([id, definition]) => ({
      id,
      label: definition.label,
      targetTitles: definition.targetTitles,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function hasDirection(id: string): boolean {
  return listDirections().some((direction) => direction.id === id)
}

export function directionLabel(id: string): string | undefined {
  return listDirections().find((direction) => direction.id === id)?.label
}

export function directionTargetTitles(id: string): string[] {
  return listDirections().find((direction) => direction.id === id)?.targetTitles ?? []
}
