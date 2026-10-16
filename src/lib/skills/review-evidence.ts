import { canonicalHash } from '../canonical-hash'
import type { documentSafeCareerData } from '../career/canonical-data'
import { hasUsableEvidence } from './match-career-skills'

export type SkillEvidenceKind = 'direct' | 'unknown-evidence'
export const skillReviewPolicyVersion = 2

type ReviewSnapshot = {
  sourceVersions?: Record<string, number>
  careerData?: ReturnType<typeof documentSafeCareerData>
  application?: { direction?: string }
  skillRequirements?: { skillId: number; requirementId: number }[]
  jobAnalysis?: {
    requirements: {
      id: number
      statement: string
      sourceText?: string | null
      importance: string
      type: string
      basis: string
    }[]
  }
}

export function readReviewSnapshot(json: string | null): ReviewSnapshot | null {
  try {
    const value = JSON.parse(json ?? 'null')
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as ReviewSnapshot)
      : null
  } catch {
    return null
  }
}

function frozenRecords(snapshot: ReviewSnapshot | null) {
  const records = new Map<string, Record<string, unknown>>()
  const collections = {
    skill: 'skills',
    experience: 'experiences',
    achievement: 'achievements',
    project: 'projects',
    publication: 'publications',
    story: 'stories',
  } as const
  for (const [type, collection] of Object.entries(collections)) {
    const rows = snapshot?.careerData?.[collection]
    if (!Array.isArray(rows)) continue
    for (const row of rows)
      if (row && typeof row.id === 'string')
        records.set(`${type}:${row.id}`, row as Record<string, unknown>)
  }
  return records
}

/** Older imported evidence uses bare IDs. Resolve only if its source is unambiguous. */
function evidenceKey(ref: string, records: ReadonlyMap<string, unknown>): string | null {
  if (records.has(ref)) return ref
  const matches = [...records.keys()].filter((key) => key.slice(key.indexOf(':') + 1) === ref)
  return matches.length === 1 ? matches[0]! : null
}

/** A catalog match or a whole-requirement assessment never establishes personal possession. */
export function reviewSkillEvidence(
  skillKey: string,
  snapshot: ReturnType<typeof readReviewSnapshot>,
): SkillEvidenceKind {
  const records = frozenRecords(snapshot)
  const skill = records.get(`skill:${skillKey}`)
  if (!skill || !hasUsableEvidence(skill)) return 'unknown-evidence'
  // Possession is a career fact, independent of the model's assessment of a
  // composite JD requirement. A dangling evidence reference cannot prove it.
  const supported = (skill.evidence as unknown[]).some((ref) => {
    const key = typeof ref === 'string' ? evidenceKey(ref, records) : null
    return key !== null && key !== `skill:${skillKey}`
  })
  return supported ? 'direct' : 'unknown-evidence'
}

/** Stable facts, not the model's wording/confidence or changing database run IDs. */
export function skillDecisionBasis(
  skillId: number,
  skillKey: string,
  snapshot: ReturnType<typeof readReviewSnapshot>,
): string | null {
  if (snapshot?.sourceVersions?.skillReviewPolicy !== skillReviewPolicyVersion) return null
  const mappings = snapshot.skillRequirements?.filter(
    (r: { skillId: number }) => r.skillId === skillId,
  )
  if (!mappings?.length || !snapshot.careerData || !snapshot.jobAnalysis?.requirements) return null
  const records = frozenRecords(snapshot)
  const skill = records.get(`skill:${skillKey}`) ?? null
  const evidence = new Map<string, unknown>()
  const visit = (ref: string) => {
    ref = evidenceKey(ref, records) ?? ref
    if (evidence.has(ref)) return
    evidence.set(ref, null)
    const row = records.get(ref)
    if (!row) return
    evidence.set(ref, row)
    for (const nested of Array.isArray(row.evidence) ? row.evidence : [])
      if (typeof nested === 'string') visit(nested)
    if (typeof row.experienceId === 'string') visit(`experience:${row.experienceId}`)
  }
  for (const ref of Array.isArray(skill?.evidence) ? skill.evidence : [])
    if (typeof ref === 'string') visit(ref)
  const requirements = mappings
    .map((mapping: { requirementId: number }) => {
      const requirement = snapshot.jobAnalysis!.requirements.find(
        (r: { id: number }) => r.id === mapping.requirementId,
      )
      return {
        statement: requirement?.statement,
        sourceText: requirement?.sourceText,
        importance: requirement?.importance,
        type: requirement?.type,
        basis: requirement?.basis,
        evidenceKind: reviewSkillEvidence(skillKey, snapshot),
      }
    })
    .sort((a: unknown, b: unknown) => canonicalHash(a).localeCompare(canonicalHash(b)))
  return canonicalHash({
    policy: skillReviewPolicyVersion,
    direction: snapshot.application?.direction,
    skillId,
    skill,
    requirements,
    evidence: [...evidence].sort(([a], [b]) => a.localeCompare(b)),
  })
}
