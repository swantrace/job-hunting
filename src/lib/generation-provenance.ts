import type { EvidenceRef } from '../ai/schemas/application-generation'

export function evidenceRefKey(ref: EvidenceRef) {
  return `${ref.sourceType}:${ref.sourceId}`
}

/**
 * Rejects any generated evidence reference that is not present in the frozen
 * evidence snapshot. This runs after Zod validation and before rendering so an
 * unsupported, skipped, pending, or unselected source ID fails the generation
 * run instead of silently entering a document.
 */
export function assertGenerationEvidenceReferences(refs: EvidenceRef[], allowed: Set<string>) {
  for (const ref of refs) {
    const key = evidenceRefKey(ref)
    if (!allowed.has(key))
      throw new Error(`Generated reference "${key}" is not in the frozen evidence snapshot.`)
  }
}

type SnapshotSelection = {
  experienceIds: string[]
  achievementIds: string[]
  projectIds: string[]
  publicationIds: string[]
  storyIds: string[]
  preferredSkillIds: string[]
  matchedConditionalSkillIds: string[]
}

/**
 * Builds the `sourceType:sourceId` allowlist from the snapshot's selected
 * evidence. Application-only skills are included by skill name so they remain
 * eligible while canonical facts resolve to their canonical IDs.
 */
export function buildGenerationEvidenceAllowlist(snapshot: {
  selection: SnapshotSelection
  provenance: Array<{ source: string; skillName: string }>
  resumeStrategy?: { deemphasizeEvidenceIds: string[] } | null
}) {
  const allowed = new Set<string>()
  const selection = snapshot.selection
  for (const id of selection.experienceIds) allowed.add(`experience:${id}`)
  for (const id of selection.achievementIds) allowed.add(`achievement:${id}`)
  for (const id of selection.projectIds) allowed.add(`project:${id}`)
  for (const id of selection.publicationIds) allowed.add(`publication:${id}`)
  for (const id of selection.storyIds) allowed.add(`story:${id}`)
  for (const id of [...selection.preferredSkillIds, ...selection.matchedConditionalSkillIds])
    allowed.add(`skill:${id}`)
  for (const provenance of snapshot.provenance)
    if (provenance.source === 'application-only') allowed.add(`skill:${provenance.skillName}`)
  // The model can never reference de-emphasized evidence.
  for (const id of snapshot.resumeStrategy?.deemphasizeEvidenceIds ?? []) allowed.delete(id)
  return allowed
}
