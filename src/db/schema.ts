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

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
  },
  (table) => [uniqueIndex('tags_name_nocase_idx').on(sql`lower(${table.name})`)],
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

export const jobApplicationsToTags = sqliteTable(
  'job_applications_to_tags',
  {
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.jobApplicationId, table.tagId] })],
)

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
