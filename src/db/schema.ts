import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  sqliteView,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { priorities, statuses } from '../lib/applications/constants'
import { intakeItemKinds, jobIntakeItemStatuses } from '../lib/batch-intake'
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

/**
 * Requirement-to-skill mapping is derived from the mention that owns it.
 * Migration 0027 replaced the physical duplicate table with this read-only
 * view, so mapping writes only ever touch `job_requirement_skill_mentions`:
 * `raw_label` mirrors the mention's `raw_term` and `confidence` is extracted
 * from its `occurrences_json`.
 */
export const jobRequirementsToSkills = sqliteView('job_requirements_to_skills', {
  jobRequirementId: integer('job_requirement_id').notNull(),
  skillId: integer('skill_id').notNull(),
  rawLabel: text('raw_label'),
  confidence: real('confidence'),
}).existing()

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

/**
 * One row per document-generation attempt, for both pipelines. `kind`
 * discriminates an application run (which carries the candidate-analysis FK)
 * from a baseline run (which stores its `{ direction, targetTitle,
 * targetKeywords }` descriptor in `baseline_json` and has no analysis run).
 * The former 1:1 result and evidence-snapshot side tables are folded into
 * columns here.
 */
export const generationRuns = sqliteTable(
  'generation_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull().default('application'),
    applicationAnalysisRunId: integer('application_analysis_run_id').references(
      () => applicationAnalysisRuns.id,
      { onDelete: 'cascade' },
    ),
    inputHash: text('input_hash'),
    frozenInputJson: text('frozen_input_json'),
    baselineJson: text('baseline_json'),
    evidenceSnapshotJson: text('evidence_snapshot_json'),
    resumeJson: text('resume_json'),
    coverLetterJson: text('cover_letter_json'),
    atsAuditJson: text('ats_audit_json'),
    resumeMarkdown: text('resume_markdown'),
    coverLetterMarkdown: text('cover_letter_markdown'),
    draftValidationJson: text('draft_validation_json'),
    rendererVersion: text('renderer_version'),
    status: text('status', { enum: runStatuses }).notNull().default('Queued'),
    queueJobId: text('queue_job_id').notNull(),
    attempts: integer('attempts').notNull().default(0),
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
    check('generation_runs_kind_check', sql`${table.kind} in ('application','baseline')`),
    check(
      'generation_runs_status_check',
      sql`${table.status} in ('Queued', 'Processing', 'Completed', 'Failed')`,
    ),
    check(
      'generation_runs_completed_check',
      sql`${table.status} != 'Completed' or ${table.completedAt} is not null`,
    ),
    check(
      'generation_runs_kind_source_check',
      sql`(${table.kind} = 'application' and ${table.applicationAnalysisRunId} is not null) or (${table.kind} = 'baseline' and ${table.applicationAnalysisRunId} is null)`,
    ),
    uniqueIndex('generation_runs_queue_job_unique_idx').on(table.queueJobId),
    index('generation_runs_analysis_created_idx').on(
      table.applicationAnalysisRunId,
      table.createdAt,
    ),
    index('generation_runs_status_idx').on(table.status),
    index('generation_runs_kind_idx').on(table.kind),
    uniqueIndex('generation_runs_inflight_unique_idx')
      .on(table.applicationAnalysisRunId, table.inputHash)
      .where(sql`${table.status} in ('Queued', 'Processing') and ${table.kind} = 'application'`),
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

export const jobApplicationsToContacts = sqliteTable(
  'job_applications_to_contacts',
  {
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    createdAt: text('created_at'),
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

export const jobIntakeBatches = sqliteTable(
  'job_intake_batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [],
)

export const jobIntakeItems = sqliteTable(
  'job_intake_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    batchId: integer('batch_id')
      .notNull()
      .references(() => jobIntakeBatches.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    kind: text('kind', { enum: intakeItemKinds }).notNull(),
    raw: text('raw').notNull(),
    normalizedUrl: text('normalized_url'),
    extractedText: text('extracted_text'),
    status: text('status', { enum: jobIntakeItemStatuses }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    errorMessage: text('error_message'),
    jobApplicationId: integer('job_application_id').references(() => jobApplications.id, {
      onDelete: 'set null',
    }),
    jobPostingId: integer('job_posting_id').references(() => jobPostings.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('job_intake_items_batch_sequence_unique_idx').on(table.batchId, table.sequence),
    index('job_intake_items_batch_idx').on(table.batchId),
    index('job_intake_items_status_idx').on(table.status),
    check('job_intake_items_kind_check', sql`${table.kind} in ('url', 'text')`),
    check(
      'job_intake_items_status_check',
      sql`${table.status} in ('pending', 'needs-pasted-text', 'ready', 'failed')`,
    ),
  ],
)

// ---------------------------------------------------------------------------
// Database-owned career facts (migrations 0026_career_facts.sql and
// 0027_simplify_schema.sql). These definitions mirror those migrations exactly:
// names, nullability, defaults, foreign keys, CHECK constraint names and
// partial/unique indexes.
// ---------------------------------------------------------------------------

/**
 * The single career-profile row (migration 0027 folded the old
 * `career_candidate` and `career_preferences` singletons into this one table).
 * Both the identity and the preference columns live here and share one
 * `revision`, so a stale form for either half conflicts.
 */
export const careerProfile = sqliteTable(
  'career_profile',
  {
    id: integer('id').primaryKey(),
    fullName: text('full_name').notNull().default(''),
    email: text('email'),
    phone: text('phone'),
    location: text('location'),
    website: text('website'),
    linkedinUrl: text('linkedin_url'),
    githubUrl: text('github_url'),
    authorizationJson: text('authorization_json'),
    careerBreakJson: text('career_break_json'),
    truthfulnessJson: text('truthfulness_json'),
    locationsJson: text('locations_json').notNull().default('[]'),
    workModesJson: text('work_modes_json').notNull().default('[]'),
    availability: text('availability'),
    compensationJson: text('compensation_json'),
    notes: text('notes'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('career_profile_singleton_check', sql`${table.id} = 1`),
    check('career_profile_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerState = sqliteTable(
  'career_state',
  {
    id: integer('id').primaryKey(),
    revision: integer('revision').notNull().default(0),
    contentHash: text('content_hash').notNull().default(''),
    legacyDocumentsJson: text('legacy_documents_json'),
    extensionJson: text('extension_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('career_state_singleton_check', sql`${table.id} = 1`),
    check('career_state_revision_check', sql`${table.revision} >= 0`),
  ],
)

export const careerDirections = sqliteTable(
  'career_directions',
  {
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    targetTitlesJson: text('target_titles_json').notNull().default('[]'),
    rulesJson: text('rules_json'),
    sortOrder: integer('sort_order').notNull().default(0),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('career_directions_key_check', sql`length(trim(${table.key})) > 0`),
    check('career_directions_revision_check', sql`${table.revision} > 0`),
    index('career_directions_sort_order_idx').on(table.sortOrder),
  ],
)

export const careerEducation = sqliteTable(
  'career_education',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stableKey: text('stable_key').notNull(),
    degree: text('degree').notNull(),
    school: text('school').notNull(),
    startDate: text('start_date'),
    endDate: text('end_date'),
    datePrecision: text('date_precision').notNull().default('day'),
    displayDates: text('display_dates'),
    year: integer('year'),
    sortOrder: integer('sort_order').notNull().default(0),
    courseworkJson: text('coursework_json').notNull().default('[]'),
    detailsJson: text('details_json'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_education_stable_key_unique_idx').on(table.stableKey),
    index('career_education_sort_order_idx').on(table.sortOrder),
    check(
      'career_education_date_precision_check',
      sql`${table.datePrecision} in ('day','month','year')`,
    ),
    check(
      'career_education_year_check',
      sql`${table.year} is null or (${table.year} >= 1900 and ${table.year} <= 2100)`,
    ),
    check('career_education_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerExperiences = sqliteTable(
  'career_experiences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stableKey: text('stable_key').notNull(),
    company: text('company').notNull(),
    role: text('role').notNull(),
    employmentNature: text('employment_nature'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    datePrecision: text('date_precision').notNull().default('day'),
    displayDates: text('display_dates'),
    sortOrder: integer('sort_order').notNull().default(0),
    context: text('context'),
    responsibilitiesJson: text('responsibilities_json').notNull().default('[]'),
    extensionJson: text('extension_json'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_experiences_stable_key_unique_idx').on(table.stableKey),
    index('career_experiences_sort_order_idx').on(table.sortOrder),
    check(
      'career_experiences_date_precision_check',
      sql`${table.datePrecision} in ('day','month','year')`,
    ),
    check('career_experiences_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerAchievements = sqliteTable(
  'career_achievements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stableKey: text('stable_key').notNull(),
    experienceId: integer('experience_id').references(() => careerExperiences.id, {
      onDelete: 'set null',
    }),
    claim: text('claim').notNull(),
    safeToUse: integer('safe_to_use', { mode: 'boolean' }).notNull().default(true),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    evidenceNarrativesJson: text('evidence_narratives_json').notNull().default('[]'),
    limitationsJson: text('limitations_json').notNull().default('[]'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_achievements_stable_key_unique_idx').on(table.stableKey),
    index('career_achievements_experience_idx').on(table.experienceId),
    check('career_achievements_safe_check', sql`${table.safeToUse} in (0,1)`),
    check('career_achievements_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerProjects = sqliteTable(
  'career_projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stableKey: text('stable_key').notNull(),
    name: text('name').notNull(),
    experienceId: integer('experience_id').references(() => careerExperiences.id, {
      onDelete: 'set null',
    }),
    ownership: text('ownership'),
    eligibility: text('eligibility').notNull().default('resume-eligible'),
    completion: text('completion'),
    urlsJson: text('urls_json').notNull().default('[]'),
    safeWording: text('safe_wording'),
    limitationsJson: text('limitations_json').notNull().default('[]'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_projects_stable_key_unique_idx').on(table.stableKey),
    index('career_projects_experience_idx').on(table.experienceId),
    check(
      'career_projects_eligibility_check',
      sql`${table.eligibility} in ('resume-eligible','not-eligible')`,
    ),
    check('career_projects_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerStories = sqliteTable(
  'career_stories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stableKey: text('stable_key').notNull(),
    experienceId: integer('experience_id').references(() => careerExperiences.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    context: text('context'),
    situation: text('situation'),
    task: text('task'),
    action: text('action'),
    result: text('result'),
    narrative: text('narrative'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_stories_stable_key_unique_idx').on(table.stableKey),
    index('career_stories_experience_idx').on(table.experienceId),
    check('career_stories_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerPublications = sqliteTable(
  'career_publications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stableKey: text('stable_key').notNull(),
    title: text('title').notNull(),
    citation: text('citation').notNull(),
    year: integer('year').notNull(),
    status: text('status').notNull(),
    safeToUse: integer('safe_to_use', { mode: 'boolean' }).notNull().default(true),
    experienceId: integer('experience_id').references(() => careerExperiences.id, {
      onDelete: 'set null',
    }),
    authorsJson: text('authors_json').notNull().default('[]'),
    authorListTruncated: integer('author_list_truncated', { mode: 'boolean' })
      .notNull()
      .default(false),
    contributionsJson: text('contributions_json').notNull().default('[]'),
    sourceUrlsJson: text('source_urls_json').notNull().default('[]'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_publications_stable_key_unique_idx').on(table.stableKey),
    index('career_publications_experience_idx').on(table.experienceId),
    check('career_publications_year_check', sql`${table.year} >= 1900 and ${table.year} <= 2100`),
    check(
      'career_publications_status_check',
      sql`${table.status} in ('published','in-review','preprint','needs-verification')`,
    ),
    check('career_publications_safe_check', sql`${table.safeToUse} in (0,1)`),
    check('career_publications_truncated_check', sql`${table.authorListTruncated} in (0,1)`),
    check('career_publications_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerSkills = sqliteTable(
  'career_skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    level: text('level'),
    resumeEligible: integer('resume_eligible', { mode: 'boolean' }).notNull().default(true),
    explanation: text('explanation'),
    notes: text('notes'),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_skills_skill_unique_idx').on(table.skillId),
    check('career_skills_resume_eligible_check', sql`${table.resumeEligible} in (0,1)`),
    check('career_skills_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerPortfolioTopics = sqliteTable(
  'career_portfolio_topics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stableKey: text('stable_key').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    outlineJson: text('outline_json').notNull().default('[]'),
    detailsJson: text('details_json'),
    retiredAt: text('retired_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_portfolio_topics_stable_key_unique_idx').on(table.stableKey),
    index('career_portfolio_topics_sort_order_idx').on(table.sortOrder),
    check('career_portfolio_topics_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerBaseResumes = sqliteTable(
  'career_base_resumes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    directionKey: text('direction_key')
      .notNull()
      .references(() => careerDirections.key, { onDelete: 'restrict' }),
    version: text('version').notNull(),
    status: text('status').notNull().default('draft'),
    markdown: text('markdown').notNull(),
    contentHash: text('content_hash').notNull(),
    approvedAt: text('approved_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('career_base_resumes_direction_version_unique_idx').on(
      table.directionKey,
      table.version,
    ),
    uniqueIndex('career_base_resumes_approved_unique_idx')
      .on(table.directionKey)
      .where(sql`${table.status} = 'approved'`),
    index('career_base_resumes_direction_status_idx').on(table.directionKey, table.status),
    check(
      'career_base_resumes_status_check',
      sql`${table.status} in ('draft','approved','superseded')`,
    ),
    check(
      'career_base_resumes_approved_at_check',
      sql`${table.status} != 'approved' or ${table.approvedAt} is not null`,
    ),
    check('career_base_resumes_markdown_check', sql`length(trim(${table.markdown})) > 0`),
    check('career_base_resumes_revision_check', sql`${table.revision} > 0`),
  ],
)

export const careerAchievementSkills = sqliteTable(
  'career_achievement_skills',
  {
    achievementId: integer('achievement_id')
      .notNull()
      .references(() => careerAchievements.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.achievementId, table.skillId] })],
)

export const careerProjectSkills = sqliteTable(
  'career_project_skills',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => careerProjects.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.skillId] })],
)

export const careerPublicationProjects = sqliteTable(
  'career_publication_projects',
  {
    publicationId: integer('publication_id')
      .notNull()
      .references(() => careerPublications.id, { onDelete: 'cascade' }),
    projectId: integer('project_id')
      .notNull()
      .references(() => careerProjects.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.publicationId, table.projectId] })],
)

export const careerAchievementPublications = sqliteTable(
  'career_achievement_publications',
  {
    achievementId: integer('achievement_id')
      .notNull()
      .references(() => careerAchievements.id, { onDelete: 'cascade' }),
    publicationId: integer('publication_id')
      .notNull()
      .references(() => careerPublications.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.achievementId, table.publicationId] })],
)

export const careerPortfolioTopicProjects = sqliteTable(
  'career_portfolio_topic_projects',
  {
    topicId: integer('topic_id')
      .notNull()
      .references(() => careerPortfolioTopics.id, { onDelete: 'cascade' }),
    projectId: integer('project_id')
      .notNull()
      .references(() => careerProjects.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.topicId, table.projectId] })],
)

/**
 * One exclusive-arc junction for every record-to-direction link (migration
 * 0027), replacing the five identical per-record tables. Exactly one record
 * column is set (database CHECK) and the partial unique indexes keep each
 * record's direction list unique. `position` preserves editorial order.
 */
export const careerRecordDirections = sqliteTable(
  'career_record_directions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    directionKey: text('direction_key')
      .notNull()
      .references(() => careerDirections.key, { onDelete: 'restrict' }),
    achievementId: integer('achievement_id').references(() => careerAchievements.id, {
      onDelete: 'cascade',
    }),
    projectId: integer('project_id').references(() => careerProjects.id, { onDelete: 'cascade' }),
    storyId: integer('story_id').references(() => careerStories.id, { onDelete: 'cascade' }),
    publicationId: integer('publication_id').references(() => careerPublications.id, {
      onDelete: 'cascade',
    }),
    topicId: integer('topic_id').references(() => careerPortfolioTopics.id, {
      onDelete: 'cascade',
    }),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    check(
      'career_record_directions_exactly_one_check',
      sql`(${table.achievementId} is not null) + (${table.projectId} is not null) + (${table.storyId} is not null) + (${table.publicationId} is not null) + (${table.topicId} is not null) = 1`,
    ),
    uniqueIndex('career_record_directions_achievement_unique_idx')
      .on(table.achievementId, table.directionKey)
      .where(sql`${table.achievementId} is not null`),
    uniqueIndex('career_record_directions_project_unique_idx')
      .on(table.projectId, table.directionKey)
      .where(sql`${table.projectId} is not null`),
    uniqueIndex('career_record_directions_story_unique_idx')
      .on(table.storyId, table.directionKey)
      .where(sql`${table.storyId} is not null`),
    uniqueIndex('career_record_directions_publication_unique_idx')
      .on(table.publicationId, table.directionKey)
      .where(sql`${table.publicationId} is not null`),
    uniqueIndex('career_record_directions_topic_unique_idx')
      .on(table.topicId, table.directionKey)
      .where(sql`${table.topicId} is not null`),
  ],
)

export const jobRequirementSkillMentions = sqliteTable(
  'job_requirement_skill_mentions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobRequirementId: integer('job_requirement_id')
      .notNull()
      .references(() => jobRequirements.id, { onDelete: 'cascade' }),
    rawTerm: text('raw_term').notNull(),
    normalizedTerm: text('normalized_term').notNull(),
    mappingState: text('mapping_state').notNull().default('pending'),
    resolvedSkillId: integer('resolved_skill_id').references(() => skills.id, {
      onDelete: 'restrict',
    }),
    occurrencesJson: text('occurrences_json').notNull().default('[]'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('job_requirement_skill_mentions_requirement_term_unique_idx').on(
      table.jobRequirementId,
      table.normalizedTerm,
    ),
    index('job_requirement_skill_mentions_resolved_skill_idx').on(table.resolvedSkillId),
    index('job_requirement_skill_mentions_state_idx').on(table.mappingState),
    check(
      'job_requirement_skill_mentions_state_check',
      sql`${table.mappingState} in ('pending','mapped','skipped')`,
    ),
    check(
      'job_requirement_skill_mentions_resolution_check',
      sql`(${table.mappingState} = 'mapped' and ${table.resolvedSkillId} is not null) or (${table.mappingState} != 'mapped' and ${table.resolvedSkillId} is null)`,
    ),
    check(
      'job_requirement_skill_mentions_term_check',
      sql`length(trim(${table.rawTerm})) > 0 and length(trim(${table.normalizedTerm})) > 0`,
    ),
    check('job_requirement_skill_mentions_revision_check', sql`${table.revision} > 0`),
  ],
)

export type CareerProfile = typeof careerProfile.$inferSelect
export type NewCareerProfile = typeof careerProfile.$inferInsert
export type CareerStateRow = typeof careerState.$inferSelect
export type NewCareerStateRow = typeof careerState.$inferInsert
export type CareerDirection = typeof careerDirections.$inferSelect
export type NewCareerDirection = typeof careerDirections.$inferInsert
export type CareerEducation = typeof careerEducation.$inferSelect
export type NewCareerEducation = typeof careerEducation.$inferInsert
export type CareerExperience = typeof careerExperiences.$inferSelect
export type NewCareerExperience = typeof careerExperiences.$inferInsert
export type CareerAchievement = typeof careerAchievements.$inferSelect
export type NewCareerAchievement = typeof careerAchievements.$inferInsert
export type CareerProject = typeof careerProjects.$inferSelect
export type NewCareerProject = typeof careerProjects.$inferInsert
export type CareerStory = typeof careerStories.$inferSelect
export type NewCareerStory = typeof careerStories.$inferInsert
export type CareerPublication = typeof careerPublications.$inferSelect
export type NewCareerPublication = typeof careerPublications.$inferInsert
export type CareerSkill = typeof careerSkills.$inferSelect
export type NewCareerSkill = typeof careerSkills.$inferInsert
export type CareerPortfolioTopic = typeof careerPortfolioTopics.$inferSelect
export type NewCareerPortfolioTopic = typeof careerPortfolioTopics.$inferInsert
export type CareerBaseResume = typeof careerBaseResumes.$inferSelect
export type NewCareerBaseResume = typeof careerBaseResumes.$inferInsert
export type CareerAchievementSkill = typeof careerAchievementSkills.$inferSelect
export type CareerProjectSkill = typeof careerProjectSkills.$inferSelect
export type CareerPublicationProject = typeof careerPublicationProjects.$inferSelect
export type CareerAchievementPublication = typeof careerAchievementPublications.$inferSelect
export type CareerPortfolioTopicProject = typeof careerPortfolioTopicProjects.$inferSelect
export type CareerRecordDirection = typeof careerRecordDirections.$inferSelect
export type NewCareerRecordDirection = typeof careerRecordDirections.$inferInsert
export type JobRequirementSkillMention = typeof jobRequirementSkillMentions.$inferSelect
export type NewJobRequirementSkillMention = typeof jobRequirementSkillMentions.$inferInsert

export type JobApplication = typeof jobApplications.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type JobPosting = typeof jobPostings.$inferSelect
export type JobPostingAnalysis = typeof jobPostingAnalyses.$inferSelect
export type JobRequirement = typeof jobRequirements.$inferSelect
export type GenerationRun = typeof generationRuns.$inferSelect
export type DocumentReview = typeof documentReviews.$inferSelect
export type ApplicationAnalysisRun = typeof applicationAnalysisRuns.$inferSelect
export type AnalysisRunDecision = typeof analysisRunDecisions.$inferSelect
export type Skill = typeof skills.$inferSelect
export type SkillAlias = typeof skillAliases.$inferSelect
export type JobIntakeBatch = typeof jobIntakeBatches.$inferSelect
export type JobIntakeItem = typeof jobIntakeItems.$inferSelect

export type { JobStatus } from '../lib/applications/constants'
export type { SkillDecision, SkillImportance, SkillOrigin, SkillReviewStatus }
