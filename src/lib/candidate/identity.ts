import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { skills } from '../../db/schema'
import { resolveSkill } from '../../db/skill-queries'
import { canonicalHash } from '../canonical-hash'

/** Resolve display-only catalog changes without rewriting historical AI snapshots. */
function currentSkillKey(key: string) {
  let skill = resolveSkill(db, key)
  const seen = new Set<number>()
  while (skill?.mergedIntoSkillId != null && !seen.has(skill.id)) {
    seen.add(skill.id)
    skill = db.select().from(skills).where(eq(skills.id, skill.mergedIntoSkillId)).get()
  }
  return skill?.key ?? key
}

/** Identity-only projection: edits/aliases/synonym merges are not evidence changes. */
export function skillMappingIdentity(value: unknown) {
  if (!Array.isArray(value)) return null
  const identities = new Set<string>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const { requirementId, skillId, skillName } = entry as Record<string, unknown>
    if (typeof requirementId !== 'number' || typeof skillId !== 'number') continue
    let id = skillId
    const seen = new Set<number>()
    while (!seen.has(id)) {
      seen.add(id)
      const skill = db.select().from(skills).where(eq(skills.id, id)).get()
      // Hard merges retain the source name/key as target aliases, not rows.
      // Resolve old frozen display identities without rewriting the snapshot.
      if (!skill && typeof skillName === 'string') {
        id = resolveSkill(db, skillName)?.id ?? id
        break
      }
      if (skill?.mergedIntoSkillId == null) break
      id = skill.mergedIntoSkillId
    }
    identities.add(`${requirementId}:${id}`)
  }
  return [...identities].sort()
}
function facts(value: unknown, personalSkill = false): unknown {
  if (Array.isArray(value)) return value.map((v) => facts(v, personalSkill))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, v]) => {
      if (['lastUpdated', 'updatedAt', 'createdAt', 'revision', 'mergedSources'].includes(key))
        return []
      if (personalSkill && ['label', 'name', 'aliases', 'category'].includes(key)) return []
      if (personalSkill && key === 'id' && typeof v === 'string') return [[key, currentSkillKey(v)]]
      if (key === 'skills' && Array.isArray(v))
        return [
          [
            key,
            v
              .map((entry) =>
                typeof entry === 'string' ? currentSkillKey(entry) : facts(entry, true),
              )
              .sort((a, b) => canonicalHash(a).localeCompare(canonicalHash(b))),
          ],
        ]
      return [[key, facts(v)]]
    }),
  )
}

export function candidateSnapshotIdentity(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const data = snapshot as Record<string, unknown>
  if (!data.jobAnalysis || !data.careerData || !data.application) return null
  return canonicalHash({
    version: data.version,
    application: data.application,
    jobPosting: data.jobPosting,
    jobAnalysis: data.jobAnalysis,
    skillMappings: skillMappingIdentity(data.skillRequirements),
    careerData: facts(data.careerData),
    sourceVersions: data.sourceVersions,
  })
}
