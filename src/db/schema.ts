import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { priorities, statuses } from '../lib/applications/constants'
import { generatedArtifactTypes, runStatuses } from '../lib/generation/constants'
import { persistedRequirementBases, requirementTypes } from '../lib/job-requirements/constants'
import {
  type SkillDecision,
  type SkillImportance,
  type SkillOrigin,
  type SkillReviewStatus,
  skillDecisions,
  skillImportances,
  skillOrigins,
  skillReviewStatuses,
} from '../lib/skills/constants'

export {
  generatedArtifactTypes,
  persistedRequirementBases as requirementBases,
  priorities,
  requirementTypes,
  runStatuses as analysisRunStatuses,
  runStatuses as generationStatuses,
  statuses,
}

export const companies = sqliteTable(
  'companies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    website: text('website'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('companies_name_nocase_idx').on(sql`lower(${table.name})`)],
)

export const skillCategories = sqliteTable(
  'skill_categories',
  {
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('skill_categories_sort_order_idx').on(table.sortOrder)],
)

export const skills = sqliteTable(
  'skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    category: text('category').references(() => skillCategories.key, { onDelete: 'restrict' }),
    reviewStatus: text('review_status', { enum: skillReviewStatuses }).notNull().default('pending'),
    origin: text('origin', { enum: skillOrigins }).notNull().default('manual'),
    mergedIntoSkillId: integer('merged_into_skill_id').references(
      (): AnySQLiteColumn => skills.id,
      { onDelete: 'restrict' },
    ),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('skills_key_unique_idx').on(table.key),
    index('skills_review_status_idx').on(table.reviewStatus),
    index('skills_category_idx').on(table.category),
    index('skills_origin_idx').on(table.origin),
    index('skills_merged_into_idx').on(table.mergedIntoSkillId),
    check(
      'skills_review_status_check',
      sql`${table.reviewStatus} in ('pending', 'approved', 'rejected', 'merged')`,
    ),
    check(
      'skills_origin_check',
      sql`${table.origin} in ('career-data', 'job-parser', 'manual', 'import')`,
    ),
    check(
      'skills_merged_check',
      sql`(${table.reviewStatus} = 'merged' and ${table.mergedIntoSkillId} is not null) or (${table.reviewStatus} != 'merged' and ${table.mergedIntoSkillId} is null)`,
    ),
  ],
)

export const skillAliases = sqliteTable(
  'skill_aliases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
    origin: text('origin', { enum: skillOrigins }).notNull().default('manual'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('skill_aliases_normalized_alias_unique_idx').on(table.normalizedAlias),
    index('skill_aliases_skill_idx').on(table.skillId),
  ],
)

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
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
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
    direction: text('direction').notNull().default('fullstack'),
    location: text('location'),
    url: text('url'),
    postedDate: text('posted_date').notNull(),
    priority: text('priority', { enum: priorities }).notNull().default('B'),
    appliedDate: text('applied_date'),
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
      'status_check',
      sql`${table.status} in ('Saved', 'Apply Today', 'Applied', 'Follow Up', 'Interviewing', 'Rejected', 'Archived')`,
    ),
    check(
      'status_before_archive_check',
      sql`${table.status} = 'Archived' or ${table.statusBeforeArchive} is null`,
    ),
    check(
      'apply_today_target_check',
      sql`${table.status} != 'Apply Today' or ${table.applyTodayTargetDate} is not null`,
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
    version: integer('version').notNull().default(1),
    rawText: text('raw_text').notNull(),
    capturedAt: text('captured_at').notNull(),
    contentHash: text('content_hash').notNull(),
  },
  (table) => [
    uniqueIndex('job_postings_application_version_unique_idx').on(
      table.jobApplicationId,
      table.version,
    ),
    index('job_postings_application_hash_idx').on(table.jobApplicationId, table.contentHash),
    index('job_postings_content_hash_idx').on(table.contentHash),
    check('job_postings_version_check', sql`${table.version} > 0`),
  ],
)

export const jobPostingAnalyses = sqliteTable(
  'job_posting_analyses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobPostingId: integer('job_posting_id')
      .notNull()
      .references(() => jobPostings.id, { onDelete: 'cascade' }),
    status: text('status', { enum: runStatuses }).notNull().default('Queued'),
    queueJobId: text('queue_job_id'),
    attempts: integer('attempts').notNull().default(0),
    inputHash: text('input_hash'),
    frozenInputJson: text('frozen_input_json'),
    resultJson: text('result_json'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    schemaVersion: text('schema_version'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    check(
      'job_posting_analyses_status_check',
      sql`${table.status} in ('Queued', 'Processing', 'Completed', 'Failed')`,
    ),
    check(
      'job_posting_analyses_completed_check',
      sql`${table.status} != 'Completed' or ${table.completedAt} is not null`,
    ),
    uniqueIndex('job_posting_analyses_queue_job_unique_idx').on(table.queueJobId),
    index('job_posting_analyses_posting_id_idx').on(table.jobPostingId, table.id),
    index('job_posting_analyses_status_idx').on(table.status),
    uniqueIndex('job_posting_analyses_inflight_unique_idx')
      .on(table.jobPostingId, table.inputHash)
      .where(sql`${table.status} in ('Queued', 'Processing')`),
  ],
)

export const jobRequirements = sqliteTable(
  'job_requirements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobPostingAnalysisId: integer('job_posting_analysis_id')
      .notNull()
      .references(() => jobPostingAnalyses.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    requirementType: text('requirement_type', { enum: requirementTypes }).notNull(),
    importance: text('importance', { enum: skillImportances }).notNull(),
    basis: text('basis', { enum: persistedRequirementBases }).notNull(),
    statement: text('statement').notNull(),
    sourceText: text('source_text'),
    inferenceRationale: text('inference_rationale'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('job_requirements_analysis_sequence_unique_idx').on(
      table.jobPostingAnalysisId,
      table.sequence,
    ),
    index('job_requirements_analysis_idx').on(table.jobPostingAnalysisId),
    index('job_requirements_type_idx').on(table.requirementType),
    index('job_requirements_importance_idx').on(table.importance),
    check('job_requirements_sequence_check', sql`${table.sequence} > 0`),
    check(
      'job_requirements_type_check',
      sql`${table.requirementType} in ('skill', 'experience', 'responsibility', 'education', 'soft-skill', 'domain')`,
    ),
    check(
      'job_requirements_importance_check',
      sql`${table.importance} in ('required', 'preferred', 'mentioned')`,
    ),
    check(
      'job_requirements_basis_check',
      sql`${table.basis} in ('explicit', 'inferred', 'legacy')`,
    ),
    check(
      'job_requirements_inferred_rationale_check',
      sql`${table.basis} != 'inferred' or (${table.inferenceRationale} is not null and trim(${table.inferenceRationale}) != '')`,
    ),
    check(
      'job_requirements_source_text_check',
      sql`${table.basis} = 'legacy' or (${table.sourceText} is not null and trim(${table.sourceText}) != '')`,
    ),
  ],
)

export const jobRequirementsToSkills = sqliteTable(
  'job_requirements_to_skills',
  {
    jobRequirementId: integer('job_requirement_id')
      .notNull()
      .references(() => jobRequirements.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    rawLabel: text('raw_label'),
    confidence: real('confidence'),
  },
  (table) => [
    primaryKey({ columns: [table.jobRequirementId, table.skillId] }),
    check(
      'job_requirements_to_skills_confidence_check',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
  ],
)

export const applicationAnalysisRuns = sqliteTable(
  'application_analysis_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobPostingAnalysisId: integer('job_posting_analysis_id')
      .notNull()
      .references(() => jobPostingAnalyses.id, { onDelete: 'cascade' }),
    status: text('status', { enum: runStatuses }).notNull().default('Queued'),
    queueJobId: text('queue_job_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
    inputHash: text('input_hash'),
    inputSnapshotJson: text('input_snapshot_json'),
    resultJson: text('result_json'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    schemaVersion: text('schema_version'),
    errorMessage: text('error_message'),
    recommendedProfileId: text('recommended_profile_id'),
    confirmedProfileId: text('confirmed_profile_id'),
    profileConfirmedAt: text('profile_confirmed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    check(
      'application_analysis_runs_status_check',
      sql`${table.status} in ('Queued', 'Processing', 'Completed', 'Failed')`,
    ),
    uniqueIndex('application_analysis_runs_queue_job_unique_idx').on(table.queueJobId),
    index('application_analysis_runs_analysis_created_idx').on(
      table.jobPostingAnalysisId,
      table.createdAt,
    ),
    index('application_analysis_runs_status_idx').on(table.status),
  ],
)

export const analysisRunDecisions = sqliteTable(
  'analysis_run_decisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    applicationAnalysisRunId: integer('application_analysis_run_id')
      .notNull()
      .references(() => applicationAnalysisRuns.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    decision: text('decision', { enum: skillDecisions }).notNull().default('pending'),
    reason: text('reason'),
    previousDecisionId: integer('previous_decision_id').references(
      (): AnySQLiteColumn => analysisRunDecisions.id,
      { onDelete: 'set null' },
    ),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('analysis_run_decisions_run_skill_unique_idx').on(
      table.applicationAnalysisRunId,
      table.skillId,
    ),
    index('analysis_run_decisions_run_idx').on(table.applicationAnalysisRunId),
    check(
      'analysis_run_decisions_decision_check',
      sql`${table.decision} in ('pending', 'skip', 'include')`,
    ),
    check(
      'analysis_run_decisions_include_reason_check',
      sql`${table.decision} != 'include' or (${table.reason} is not null and trim(${table.reason}) != '')`,
    ),
  ],
)

export const generationRuns = sqliteTable(
  'generation_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    applicationAnalysisRunId: integer('application_analysis_run_id')
      .notNull()
      .references(() => applicationAnalysisRuns.id, { onDelete: 'cascade' }),
    status: text('status', { enum: runStatuses }).notNull().default('Queued'),
    queueJobId: text('queue_job_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
    inputHash: text('input_hash'),
    frozenInputJson: text('frozen_input_json'),
    resumeModel: text('resume_model'),
    coverLetterModel: text('cover_letter_model'),
    promptVersion: text('prompt_version'),
    schemaVersion: text('schema_version'),
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
    index('generation_runs_analysis_created_idx').on(
      table.applicationAnalysisRunId,
      table.createdAt,
    ),
    index('generation_runs_status_idx').on(table.status),
    uniqueIndex('generation_runs_inflight_unique_idx')
      .on(table.applicationAnalysisRunId, table.inputHash)
      .where(sql`${table.status} in ('Queued', 'Processing')`),
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

export const generationEvidenceSnapshots = sqliteTable(
  'generation_evidence_snapshots',
  {
    generationRunId: integer('generation_run_id')
      .primaryKey()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    snapshotJson: text('snapshot_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [],
)

export const generationRunResults = sqliteTable(
  'generation_run_results',
  {
    generationRunId: integer('generation_run_id')
      .primaryKey()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    resumeJson: text('resume_json'),
    coverLetterJson: text('cover_letter_json'),
    atsAuditJson: text('ats_audit_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [],
)

export const documentReviews = sqliteTable(
  'document_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    generationRunId: integer('generation_run_id')
      .notNull()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    status: text('status', { enum: runStatuses }).notNull().default('Queued'),
    queueJobId: text('queue_job_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
    inputHash: text('input_hash'),
    resultJson: text('result_json'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    schemaVersion: text('schema_version'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    check(
      'document_reviews_status_check',
      sql`${table.status} in ('Queued', 'Processing', 'Completed', 'Failed')`,
    ),
    uniqueIndex('document_reviews_queue_job_unique_idx').on(table.queueJobId),
    index('document_reviews_run_created_idx').on(table.generationRunId, table.createdAt),
    index('document_reviews_status_idx').on(table.status),
  ],
)

export const baselineGenerationRuns = sqliteTable(
  'baseline_generation_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    direction: text('direction').notNull(),
    targetTitle: text('target_title').notNull(),
    targetKeywords: text('target_keywords').notNull().default('[]'),
    status: text('status', { enum: runStatuses }).notNull().default('Queued'),
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
      'baseline_generation_runs_status_check',
      sql`${table.status} in ('Queued', 'Processing', 'Completed', 'Failed')`,
    ),
    uniqueIndex('baseline_generation_runs_queue_job_unique_idx').on(table.queueJobId),
    index('baseline_generation_runs_direction_created_idx').on(table.direction, table.createdAt),
    index('baseline_generation_runs_status_idx').on(table.status),
  ],
)

export const baselineGeneratedArtifacts = sqliteTable(
  'baseline_generated_artifacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    baselineGenerationRunId: integer('baseline_generation_run_id')
      .notNull()
      .references(() => baselineGenerationRuns.id, { onDelete: 'cascade' }),
    type: text('type', { enum: generatedArtifactTypes }).notNull(),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    check('baseline_generated_artifacts_type_check', sql`${table.type} = 'resume'`),
    uniqueIndex('baseline_generated_artifacts_run_type_unique_idx').on(
      table.baselineGenerationRunId,
      table.type,
    ),
  ],
)

export const baselineGenerationEvidenceSnapshots = sqliteTable(
  'baseline_generation_evidence_snapshots',
  {
    baselineGenerationRunId: integer('baseline_generation_run_id')
      .primaryKey()
      .references(() => baselineGenerationRuns.id, { onDelete: 'cascade' }),
    snapshotJson: text('snapshot_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [],
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
    relationshipType: text('relationship_type'),
    isPrimary: integer('is_primary', { mode: 'boolean' }),
    notes: text('notes'),
    createdAt: text('created_at'),
  },
  (table) => [
    primaryKey({ columns: [table.jobApplicationId, table.contactId] }),
    index('job_applications_to_contacts_contact_idx').on(table.contactId),
    uniqueIndex('job_applications_to_contacts_primary_unique_idx')
      .on(table.jobApplicationId)
      .where(sql`${table.isPrimary} = 1`),
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
    actionType: text('action_type').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
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
    roundType: text('round_type').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('interviews_job_date_idx').on(table.jobApplicationId, table.interviewDate)],
)

export type JobApplication = typeof jobApplications.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type JobPosting = typeof jobPostings.$inferSelect
export type JobPostingAnalysis = typeof jobPostingAnalyses.$inferSelect
export type JobRequirement = typeof jobRequirements.$inferSelect
export type GenerationRun = typeof generationRuns.$inferSelect
export type GenerationRunResult = typeof generationRunResults.$inferSelect
export type DocumentReview = typeof documentReviews.$inferSelect
export type BaselineGenerationRun = typeof baselineGenerationRuns.$inferSelect
export type ApplicationAnalysisRun = typeof applicationAnalysisRuns.$inferSelect
export type AnalysisRunDecision = typeof analysisRunDecisions.$inferSelect
export type Skill = typeof skills.$inferSelect
export type SkillAlias = typeof skillAliases.$inferSelect

export type { JobStatus } from '../lib/applications/constants'
export type { SkillDecision, SkillImportance, SkillOrigin, SkillReviewStatus }
