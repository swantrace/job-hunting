import { z } from 'zod'

/**
 * The versioned `career-dataset` interchange format.
 *
 * A dataset is self-contained: every cross-record reference is a portable
 * stable key, never an internal SQLite row id, so importing it into a different
 * database remaps identities instead of copying them. Every document and record
 * object is loose — unknown extension keys round-trip untouched — and every fact
 * the relational schema cannot express is carried in an `extensions` object.
 *
 * `excluded` is deliberately part of the payload: a logical export can never be
 * a complete operational backup, and the note names what it cannot carry.
 */

export const careerDatasetFormat = 'career-dataset'
export const careerDatasetSchemaVersion = 1

/**
 * What a logical dataset can never carry, and why a full operational recovery
 * needs a consistent SQLite backup. Shared by the exporter and the directory
 * importer so both formats explain the same limitation.
 */
export const careerDatasetExcluded = {
  kinds: [
    'oauth-credentials',
    'application-history',
    'job-postings-and-analyses',
    'generation-runs',
    'document-reviews',
    'artifact-binaries',
  ],
  reason:
    'A career dataset is a logical export, not an operational backup. It cannot carry Google Drive OAuth credentials or encryption keys, application and analysis history, job postings, generation runs, document reviews, or artifact file contents and paths. Full recovery requires a consistent SQLite backup of jobs.db together with the artifact store.',
} as const

const stableKeySchema = z.string().trim().min(1).max(200)
const nullableText = z.string().nullable()
const nullableDate = z.string().nullable()
const datePrecisionSchema = z.enum(['day', 'month', 'year'])
const extensionsSchema = z.looseObject({})

export const careerDatasetScopeSchema = z.union([
  z.looseObject({ kind: z.literal('full') }),
  z.looseObject({ kind: z.literal('direction'), directionKey: stableKeySchema }),
])

const categorySchema = z.looseObject({
  key: stableKeySchema,
  label: z.string().trim().min(1),
  sortOrder: z.number().int(),
})

const catalogEntrySchema = z.looseObject({
  key: stableKeySchema,
  name: z.string().trim().min(1),
  category: z.string().trim().min(1).nullable(),
  reviewStatus: z.enum(['pending', 'approved', 'rejected', 'merged']),
  origin: z.enum(['career-data', 'job-parser', 'manual', 'import']),
  aliases: z.array(z.string().trim().min(1)).optional(),
  mergedIntoKey: stableKeySchema.nullable().optional(),
})

const candidateSchema = z.looseObject({
  fullName: z.string().trim().min(1),
  email: nullableText.optional(),
  phone: nullableText.optional(),
  location: nullableText.optional(),
  website: nullableText.optional(),
  linkedinUrl: nullableText.optional(),
  githubUrl: nullableText.optional(),
  authorization: z.unknown().nullable().optional(),
  careerBreak: z.unknown().nullable().optional(),
  truthfulness: z.unknown().nullable().optional(),
})

const preferencesSchema = z.looseObject({
  locations: z.array(z.string()).optional(),
  workModes: z.array(z.string()).optional(),
  availability: nullableText.optional(),
  compensation: z.unknown().nullable().optional(),
  notes: nullableText.optional(),
})

const educationSchema = z.looseObject({
  stableKey: stableKeySchema,
  degree: z.string().trim().min(1),
  school: z.string().trim().min(1),
  startDate: nullableDate.optional(),
  endDate: nullableDate.optional(),
  datePrecision: datePrecisionSchema.optional(),
  displayDates: nullableText.optional(),
  year: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
  coursework: z.array(z.string()).optional(),
  details: z.unknown().optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const experienceSchema = z.looseObject({
  stableKey: stableKeySchema,
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  employmentNature: nullableText.optional(),
  startDate: nullableDate.optional(),
  endDate: nullableDate.optional(),
  datePrecision: datePrecisionSchema.optional(),
  displayDates: nullableText.optional(),
  sortOrder: z.number().int().optional(),
  context: nullableText.optional(),
  responsibilities: z.array(z.string()).optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const achievementSchema = z.looseObject({
  stableKey: stableKeySchema,
  experienceKey: stableKeySchema.nullable().optional(),
  claim: z.string().trim().min(1),
  safeToUse: z.boolean().optional(),
  evidence: z.array(z.string()).optional(),
  evidenceNarratives: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  skillKeys: z.array(stableKeySchema).optional(),
  directionKeys: z.array(stableKeySchema).optional(),
  publicationKeys: z.array(stableKeySchema).optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const projectSchema = z.looseObject({
  stableKey: stableKeySchema,
  name: z.string().trim().min(1),
  experienceKey: stableKeySchema.nullable().optional(),
  ownership: nullableText.optional(),
  eligibility: z.enum(['resume-eligible', 'not-eligible']).optional(),
  completion: nullableText.optional(),
  urls: z.array(z.string()).optional(),
  safeWording: nullableText.optional(),
  limitations: z.array(z.string()).optional(),
  skillKeys: z.array(stableKeySchema).optional(),
  directionKeys: z.array(stableKeySchema).optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const storySchema = z.looseObject({
  stableKey: stableKeySchema,
  experienceKey: stableKeySchema.nullable().optional(),
  title: z.string().trim().min(1),
  context: nullableText.optional(),
  situation: nullableText.optional(),
  task: nullableText.optional(),
  action: nullableText.optional(),
  result: nullableText.optional(),
  narrative: nullableText.optional(),
  directionKeys: z.array(stableKeySchema).optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const publicationSchema = z.looseObject({
  stableKey: stableKeySchema,
  title: z.string().trim().min(1),
  citation: z.string().trim().min(1),
  year: z.number().int(),
  status: z.enum(['published', 'in-review', 'preprint', 'needs-verification']),
  safeToUse: z.boolean().optional(),
  experienceKey: stableKeySchema.nullable().optional(),
  authors: z.array(z.looseObject({ name: z.string(), isCandidate: z.boolean() })).optional(),
  authorListTruncated: z.boolean().optional(),
  contributions: z.array(z.string()).optional(),
  sourceUrls: z.array(z.string()).optional(),
  projectKeys: z.array(stableKeySchema).optional(),
  directionKeys: z.array(stableKeySchema).optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const personalSkillSchema = z.looseObject({
  skillKey: stableKeySchema,
  level: nullableText.optional(),
  resumeEligible: z.boolean().optional(),
  explanation: nullableText.optional(),
  notes: nullableText.optional(),
  evidence: z.array(z.string()).optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const directionSchema = z.looseObject({
  key: stableKeySchema,
  label: z.string().trim().min(1),
  targetTitles: z.array(z.string().trim().min(1)).min(1),
  rules: z.unknown().nullable().optional(),
  sortOrder: z.number().int().optional(),
  retiredAt: nullableText.optional(),
})

const portfolioTopicSchema = z.looseObject({
  stableKey: stableKeySchema,
  title: z.string().trim().min(1),
  status: z.string().optional(),
  sortOrder: z.number().int().optional(),
  outline: z.array(z.string()).optional(),
  details: z.unknown().optional(),
  projectKeys: z.array(stableKeySchema).optional(),
  directionKeys: z.array(stableKeySchema).optional(),
  retiredAt: nullableText.optional(),
  extensions: extensionsSchema.optional(),
})

const baseResumeSchema = z.looseObject({
  directionKey: stableKeySchema,
  version: z.string().trim().min(1),
  status: z.enum(['draft', 'approved', 'superseded']),
  markdown: z.string(),
  contentHash: z.string(),
  approvedAt: nullableText.optional(),
})

const careerStateSchema = z.looseObject({
  legacyDocuments: z.unknown().nullable().optional(),
  extensions: extensionsSchema.optional(),
})

export const careerDatasetSchema = z.looseObject({
  format: z.literal(careerDatasetFormat),
  schemaVersion: z.literal(careerDatasetSchemaVersion),
  exportedAt: z.string(),
  scope: careerDatasetScopeSchema,
  categories: z.array(categorySchema),
  catalog: z.array(catalogEntrySchema),
  candidate: candidateSchema.nullable(),
  preferences: preferencesSchema.nullable(),
  education: z.array(educationSchema),
  experiences: z.array(experienceSchema),
  achievements: z.array(achievementSchema),
  projects: z.array(projectSchema),
  stories: z.array(storySchema),
  publications: z.array(publicationSchema),
  personalSkills: z.array(personalSkillSchema),
  directions: z.array(directionSchema),
  portfolioTopics: z.array(portfolioTopicSchema),
  baseResumes: z.array(baseResumeSchema),
  state: careerStateSchema,
  excluded: z.looseObject({ kinds: z.array(z.string()), reason: z.string() }),
})

export type CareerDataset = z.infer<typeof careerDatasetSchema>
export type CareerDatasetScope = z.infer<typeof careerDatasetScopeSchema>
export type CareerDatasetCatalogEntry = z.infer<typeof catalogEntrySchema>
export type CareerDatasetEducation = z.infer<typeof educationSchema>
export type CareerDatasetExperience = z.infer<typeof experienceSchema>
export type CareerDatasetAchievement = z.infer<typeof achievementSchema>
export type CareerDatasetProject = z.infer<typeof projectSchema>
export type CareerDatasetStory = z.infer<typeof storySchema>
export type CareerDatasetPublication = z.infer<typeof publicationSchema>
export type CareerDatasetPersonalSkill = z.infer<typeof personalSkillSchema>
export type CareerDatasetDirection = z.infer<typeof directionSchema>
export type CareerDatasetPortfolioTopic = z.infer<typeof portfolioTopicSchema>
export type CareerDatasetBaseResume = z.infer<typeof baseResumeSchema>

/** Parses and validates a serialized or already-parsed `career-dataset` payload. */
export function parseCareerDataset(json: unknown): CareerDataset {
  return careerDatasetSchema.parse(json)
}
