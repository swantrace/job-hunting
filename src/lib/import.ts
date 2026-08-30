import { z } from 'zod'
import {
  tailoredCoverLetterSchema,
  tailoredResumeSchema,
} from '../ai/schemas/application-generation'
import { candidateFitSchema } from '../ai/schemas/candidate-fit'
import { documentReviewSchema } from '../ai/schemas/document-review'
import { normalizeSkillAlias } from './skills/normalize'

const record = z.record(z.string(), z.unknown())

export const importPayloadSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    exportedAt: z.string().optional(),
    companies: z.array(record).default([]),
    skills: z.array(record).default([]),
    skillAliases: z.array(record).default([]),
    // Legacy exports used tags. Keep accepting them while normalizing the payload.
    tags: z.array(record).default([]),
    contacts: z.array(record).default([]),
    applications: z.array(record).default([]),
    applicationSkills: z.array(record).default([]),
    applicationTags: z.array(record).default([]),
    applicationContacts: z.array(record).default([]),
    followUps: z.array(record).default([]),
    interviews: z.array(record).default([]),
    jobPostings: z.array(record).default([]),
    jobPostingAnalyses: z.array(record).default([]),
    jobRequirements: z.array(record).default([]),
    jobRequirementsToSkills: z.array(record).default([]),
    applicationAnalysisRuns: z.array(record).default([]),
    analysisRunDecisions: z.array(record).default([]),
    generationRuns: z.array(record).default([]),
    generationRunResults: z.array(record).default([]),
    documentReviews: z.array(record).default([]),
  })
  .transform(({ tags, applicationTags, ...payload }) => ({
    ...payload,
    skills: payload.skills.length ? payload.skills : tags,
    applicationSkills: (payload.applicationSkills.length
      ? payload.applicationSkills
      : applicationTags
    ).map(
      (relation): Record<string, unknown> => ({
        ...relation,
        skillId: relation.skillId ?? relation.tagId,
        skillName: relation.skillName ?? relation.tagName,
      }),
    ),
  }))

export type ImportPayload = z.infer<typeof importPayloadSchema>

/**
 * Validates embedded JSON snapshots against their authoritative schemas so a
 * malformed snapshot fails with a useful preview error before any write.
 */
export function validateImportSnapshots(payload: ImportPayload): string[] {
  const errors: string[] = []
  const parseJson = (value: unknown): unknown | null => {
    try {
      return JSON.parse(String(value))
    } catch {
      return null
    }
  }
  for (const run of payload.applicationAnalysisRuns) {
    if (run.result_json != null) {
      const json = parseJson(run.result_json)
      if (json === null || !candidateFitSchema.safeParse(json).success)
        errors.push(`Application analysis run ${run.id} has invalid result JSON.`)
    }
    if (run.input_snapshot_json != null && parseJson(run.input_snapshot_json) === null)
      errors.push(`Application analysis run ${run.id} has malformed input snapshot JSON.`)
  }
  for (const result of payload.generationRunResults) {
    if (result.resume_json != null) {
      const json = parseJson(result.resume_json)
      if (json === null || !tailoredResumeSchema.safeParse(json).success)
        errors.push(`Generation run ${result.generation_run_id} has invalid resume JSON.`)
    }
    if (result.cover_letter_json != null) {
      const json = parseJson(result.cover_letter_json)
      if (json === null || !tailoredCoverLetterSchema.safeParse(json).success)
        errors.push(`Generation run ${result.generation_run_id} has invalid cover-letter JSON.`)
    }
  }
  for (const review of payload.documentReviews) {
    if (review.result_json != null) {
      const json = parseJson(review.result_json)
      if (json === null || !documentReviewSchema.safeParse(json).success)
        errors.push(`Document review ${review.id} has invalid result JSON.`)
    }
  }
  return errors
}

export const textValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
export const nullableText = (value: unknown) => textValue(value) || null
export const key = (...values: unknown[]) =>
  values.map((value) => textValue(value).toLocaleLowerCase()).join('|')

export function companyKey(company: Record<string, unknown>) {
  return key(company.name)
}

export function skillKey(skill: Record<string, unknown>) {
  return key(skill.name)
}

export function contactKey(contact: Record<string, unknown>, companyName: string) {
  return key(companyName, contact.email || contact.name)
}

export function applicationKey(application: Record<string, unknown>, companyName: string) {
  return key(
    companyName,
    application.jobTitle,
    application.url || `${application.location}|${application.postedDate}`,
  )
}

/**
 * Detects ambiguous alias and decision collisions in a payload without writing
 * anything. Shared normalized aliases and conflicting decisions on the same
 * application/skill pair are reported so the preview never silently merges.
 */
export function detectImportConflicts(
  payload: Partial<Pick<ImportPayload, 'skills' | 'skillAliases' | 'applicationSkills'>>,
): string[] {
  const conflicts: string[] = []
  const owners = new Map<string, string>()
  const claim = (owner: string, normalized: string) => {
    if (!normalized) return
    const existing = owners.get(normalized)
    if (existing && existing !== owner)
      conflicts.push(`Alias "${normalized}" is shared by "${existing}" and "${owner}".`)
    else if (!existing) owners.set(normalized, owner)
  }
  for (const skill of payload.skills ?? []) {
    const owner = textValue(skill.name) || textValue(skill.key) || String(skill.id)
    claim(owner, normalizeSkillAlias(textValue(skill.name)))
    claim(owner, normalizeSkillAlias(textValue(skill.key)))
    const aliases = skill.aliases
    if (Array.isArray(aliases))
      for (const alias of aliases)
        if (typeof alias === 'string') claim(owner, normalizeSkillAlias(alias))
  }
  for (const alias of payload.skillAliases ?? [])
    claim(
      String(alias.skillId),
      normalizeSkillAlias(textValue(alias.alias) || textValue(alias.normalizedAlias)),
    )

  const decisionByPair = new Map<string, string>()
  for (const relation of payload.applicationSkills ?? []) {
    const pair = `${relation.jobApplicationId}|${relation.skillId ?? relation.skillName}`
    const decision = textValue(relation.userDecision)
    if (!decision || decision === 'pending') continue
    const existing = decisionByPair.get(pair)
    if (existing && existing !== decision)
      conflicts.push(`Conflicting decisions for application skill ${pair}.`)
    else if (!existing) decisionByPair.set(pair, decision)
  }
  return conflicts
}
