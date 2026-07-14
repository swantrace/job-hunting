import { z } from 'zod'

const record = z.record(z.string(), z.unknown())

export const importPayloadSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    exportedAt: z.string().optional(),
    companies: z.array(record).default([]),
    skills: z.array(record).default([]),
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
  })
  .transform(({ tags, applicationTags, ...payload }) => ({
    ...payload,
    skills: payload.skills.length ? payload.skills : tags,
    applicationSkills: (payload.applicationSkills.length
      ? payload.applicationSkills
      : applicationTags
    ).map((relation) => ({
      ...relation,
      skillId: relation.skillId ?? relation.tagId,
      skillName: relation.skillName ?? relation.tagName,
    })),
  }))

export type ImportPayload = z.infer<typeof importPayloadSchema>

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
