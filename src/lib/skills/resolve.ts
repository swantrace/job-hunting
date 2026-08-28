import type { Skill } from '../../db/schema'
import { normalizeSkillAlias } from './normalize'

/**
 * Canonical skill input resolution policy. The resolver is supplied by the
 * database layer so this module stays free of storage dependencies.
 */
export type SkillResolver = {
  byAlias: (normalizedAlias: string) => Skill | undefined
  byKey: (key: string) => Skill | undefined
}

/**
 * Resolves raw input to a canonical skill by normalized alias first and then
 * by canonical key, matching the fixed taxonomy contract.
 */
export function resolveSkillInput(resolver: SkillResolver, input: string): Skill | undefined {
  const normalized = normalizeSkillAlias(input)
  return resolver.byAlias(normalized) ?? resolver.byKey(normalized)
}
