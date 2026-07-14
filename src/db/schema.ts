import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const priorities = ['A', 'B', 'C'] as const
export const matchLevels = ['A', 'B'] as const
export const statuses = [
  'Saved',
  'Apply Today',
  'Applied',
  'Follow Up',
  'Interviewing',
  'Rejected',
  'Archived',
] as const
export const generationStatuses = ['Queued', 'Processing', 'Completed', 'Failed'] as const
export const generatedArtifactTypes = ['job_context', 'resume', 'cover_letter'] as const

export const companies = sqliteTable(
  'companies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    website: text('website'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('companies_name_nocase_idx').on(sql`lower(${table.name})`)],
)

export const skills = sqliteTable(
  'skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
  },
  (table) => [uniqueIndex('skills_name_nocase_idx').on(sql`lower(${table.name})`)],
)

// A contact belongs to one company. Applications connect to contacts through
// jobApplicationsToContacts below, allowing a recruiter or interviewer to be
// associated with multiple applications at the same company.
export const contacts = sqliteTable(
  'contacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    email: text('email'),
    linkedinUrl: text('linkedin_url'),
  },
  (table) => [
    index('contacts_company_idx').on(table.companyId),
    uniqueIndex('contacts_company_email_nocase_idx').on(
      table.companyId,
      sql`lower(${table.email})`,
    ),
  ],
)

export const jobApplications = sqliteTable(
  'job_applications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    jobTitle: text('job_title').notNull(),
    // This is the id from profiles/<direction>.profile.json, such as "fullstack".
    direction: text('direction').notNull().default('fullstack'),
    location: text('location'),
    url: text('url'),
    postedDate: text('posted_date').notNull(),
    priority: text('priority', { enum: priorities }).notNull().default('B'),
    appliedDate: text('applied_date'),
    resumeVersion: text('resume_version'),
    matchLevel: text('match_level', { enum: matchLevels }),
    applicationSource: text('application_source'),
    salary: text('salary'),
    notes: text('notes'),
    status: text('status', { enum: statuses }).notNull().default('Saved'),
    statusBeforeArchive: text('status_before_archive', { enum: statuses }),
    applyTodayTargetDate: text('apply_today_target_date'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('priority_check', sql`${table.priority} in ('A', 'B', 'C')`),
    check(
      'match_level_check',
      sql`${table.matchLevel} is null or ${table.matchLevel} in ('A', 'B')`,
    ),
    check(
      'status_check',
      sql`${table.status} in ('Saved', 'Apply Today', 'Applied', 'Follow Up', 'Interviewing', 'Rejected', 'Archived')`,
    ),
    index('jobs_status_idx').on(table.status),
    index('jobs_priority_idx').on(table.priority),
    index('jobs_company_idx').on(table.companyId),
    index('jobs_posted_date_idx').on(table.postedDate),
    index('jobs_applied_date_idx').on(table.appliedDate),
    index('jobs_target_date_idx').on(table.applyTodayTargetDate),
    index('jobs_status_updated_idx').on(table.status, table.updatedAt),
  ],
)

export const jobPostings = sqliteTable(
  'job_postings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    rawText: text('raw_text').notNull(),
    capturedAt: text('captured_at').notNull(),
    contentHash: text('content_hash').notNull(),
    parsedAt: text('parsed_at'),
    parserModel: text('parser_model'),
    parserPromptVersion: text('parser_prompt_version'),
  },
  (table) => [
    uniqueIndex('job_postings_application_unique_idx').on(table.jobApplicationId),
    index('job_postings_content_hash_idx').on(table.contentHash),
  ],
)

export const jobPostingAnalyses = sqliteTable(
  'job_posting_analyses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobPostingId: integer('job_posting_id')
      .notNull()
      .references(() => jobPostings.id, { onDelete: 'cascade' }),
    requirements: text('requirements'),
    responsibilities: text('responsibilities'),
    painPoints: text('pain_points'),
    culture: text('culture'),
    redFlags: text('red_flags'),
    successMetrics: text('success_metrics'),
    benefits: text('benefits'),
    notes: text('notes'),
    generatedAt: text('generated_at').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version'),
  },
  (table) => [
    uniqueIndex('job_posting_analyses_posting_unique_idx').on(table.jobPostingId),
    index('job_posting_analyses_generated_idx').on(table.generatedAt),
  ],
)

export const jobApplicationsToSkills = sqliteTable(
  'job_applications_to_skills',
  {
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.jobApplicationId, table.skillId] })],
)

export const generationRuns = sqliteTable(
  'generation_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    status: text('status', { enum: generationStatuses }).notNull().default('Queued'),
    queueJobId: text('queue_job_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    check(
      'generation_runs_status_check',
      sql`${table.status} in ('Queued', 'Processing', 'Completed', 'Failed')`,
    ),
    uniqueIndex('generation_runs_queue_job_unique_idx').on(table.queueJobId),
    index('generation_runs_application_created_idx').on(table.jobApplicationId, table.createdAt),
    index('generation_runs_status_idx').on(table.status),
  ],
)

export const generatedArtifacts = sqliteTable(
  'generated_artifacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    generationRunId: integer('generation_run_id')
      .notNull()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    type: text('type', { enum: generatedArtifactTypes }).notNull(),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').notNull(),
    googleDriveFileId: text('google_drive_file_id'),
    googleDriveUrl: text('google_drive_url'),
    googleDriveUploadedAt: text('google_drive_uploaded_at'),
    googleDriveError: text('google_drive_error'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    check(
      'generated_artifacts_type_check',
      sql`${table.type} in ('job_context', 'resume', 'cover_letter')`,
    ),
    uniqueIndex('generated_artifacts_run_type_unique_idx').on(table.generationRunId, table.type),
  ],
)

export const googleDriveConnections = sqliteTable('google_drive_connections', {
  id: integer('id').primaryKey(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  folderId: text('folder_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const jobApplicationsToContacts = sqliteTable(
  'job_applications_to_contacts',
  {
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.jobApplicationId, table.contactId] }),
    index('job_applications_to_contacts_contact_idx').on(table.contactId),
  ],
)

export const followUps = sqliteTable(
  'follow_ups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    actionDate: text('action_date').notNull(),
    notes: text('notes'),
  },
  (table) => [index('follow_ups_job_date_idx').on(table.jobApplicationId, table.actionDate)],
)

export const interviews = sqliteTable(
  'interviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    interviewDate: text('interview_date').notNull(),
    roundName: text('round_name').notNull(),
    notes: text('notes'),
  },
  (table) => [index('interviews_job_date_idx').on(table.jobApplicationId, table.interviewDate)],
)

export type JobStatus = (typeof statuses)[number]
export type JobApplication = typeof jobApplications.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type JobPosting = typeof jobPostings.$inferSelect
export type JobPostingAnalysis = typeof jobPostingAnalyses.$inferSelect
export type GenerationRun = typeof generationRuns.$inferSelect
