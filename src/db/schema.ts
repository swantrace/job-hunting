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
import { matchLevels, priorities, statuses } from '../lib/applications/constants'
import { generatedArtifactTypes, runStatuses } from '../lib/generation/constants'
import { persistedRequirementBases, requirementTypes } from '../lib/job-requirements/constants'
import {
  type SkillDecision,
  type SkillImportance,
  type SkillMatchResult,
  type SkillOrigin,
  type SkillReviewStatus,
  skillDecisions,
  skillImportances,
  skillMatchResults,
  skillOrigins,
  skillReviewStatuses,
} from '../lib/skills/constants'

export {
  generatedArtifactTypes,
  matchLevels,
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
  },
  (table) => [uniqueIndex('companies_name_nocase_idx').on(sql`lower(${table.name})`)],
)

/**
 * A database mirror of config/skill-taxonomy.json. The JSON configuration owns
 * these rows; SQLite preserves referential integrity for operational skills.
 */
export const skillCategories = sqliteTable(
  'skill_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('skill_categories_key_unique_idx').on(table.key)],
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
    careerSkillId: text('career_skill_id'),
    mergedIntoSkillId: integer('merged_into_skill_id').references(
      (): AnySQLiteColumn => skills.id,
      { onDelete: 'set null' },
    ),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('skills_key_unique_idx').on(table.key),
    uniqueIndex('skills_career_skill_id_unique_idx').on(table.careerSkillId),
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
    // Run lifecycle. Existing rows backfill to Completed; new runs start Queued.
    // Staleness is always derived from input_hash/schema_version, never stored.
    status: text('status', { enum: runStatuses }).notNull().default('Completed'),
    queueJobId: text('queue_job_id'),
    attempts: integer('attempts').notNull().default(0),
    inputHash: text('input_hash'),
    frozenInputJson: text('frozen_input_json'),
    errorMessage: text('error_message'),
    // Result columns kept for backward compatibility with the pre-run schema.
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
    summary: text('summary'),
    roleType: text('role_type'),
    advertisedSeniority: text('advertised_seniority'),
    practicalSeniority: text('practical_seniority'),
    classificationRationale: text('classification_rationale'),
    functionalEmphasisJson: text('functional_emphasis_json'),
    interviewQuestionsJson: text('interview_questions_json'),
    schemaVersion: text('schema_version'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    uniqueIndex('job_posting_analyses_queue_job_unique_idx').on(table.queueJobId),
    index('job_posting_analyses_posting_id_idx').on(table.jobPostingId, table.id),
    index('job_posting_analyses_status_idx').on(table.status),
    index('job_posting_analyses_generated_idx').on(table.generatedAt),
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
      .references(() => skills.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.jobRequirementId, table.skillId] })],
)

export const applicationAnalysisRuns = sqliteTable(
  'application_analysis_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
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
    index('application_analysis_runs_application_created_idx').on(
      table.jobApplicationId,
      table.createdAt,
    ),
    index('application_analysis_runs_status_idx').on(table.status),
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
    rawLabel: text('raw_label'),
    sourceText: text('source_text'),
    importance: text('importance', { enum: skillImportances }).notNull().default('mentioned'),
    parserConfidence: real('parser_confidence'),
    analysisResult: text('analysis_result', { enum: skillMatchResults })
      .notNull()
      .default('not-in-career-data'),
    userDecision: text('user_decision', { enum: skillDecisions }).notNull().default('pending'),
    decisionReason: text('decision_reason'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.jobApplicationId, table.skillId] }),
    check(
      'job_applications_to_skills_importance_check',
      sql`${table.importance} in ('required', 'preferred', 'mentioned')`,
    ),
    check(
      'job_applications_to_skills_analysis_check',
      sql`${table.analysisResult} in ('proven-match', 'not-in-career-data')`,
    ),
    check(
      'job_applications_to_skills_decision_check',
      sql`${table.userDecision} in ('pending', 'skip', 'include')`,
    ),
    check(
      'job_applications_to_skills_include_reason_check',
      sql`${table.userDecision} != 'include' or (${table.decisionReason} is not null and trim(${table.decisionReason}) != '')`,
    ),
  ],
)

export const generationRuns = sqliteTable(
  'generation_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobApplicationId: integer('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
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

export const generationEvidenceSnapshots = sqliteTable(
  'generation_evidence_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    generationRunId: integer('generation_run_id')
      .notNull()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    snapshotJson: text('snapshot_json').notNull(),
    filePath: text('file_path').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('generation_evidence_snapshots_run_unique_idx').on(table.generationRunId),
  ],
)

export const generationRunResults = sqliteTable(
  'generation_run_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    generationRunId: integer('generation_run_id')
      .notNull()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    resumeJson: text('resume_json'),
    coverLetterJson: text('cover_letter_json'),
    atsAuditJson: text('ats_audit_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('generation_run_results_run_unique_idx').on(table.generationRunId)],
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

// Baseline documents are deliberately independent of applications: they are
// direction-specific resumes created without an employer or job post.
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
    id: integer('id').primaryKey({ autoIncrement: true }),
    baselineGenerationRunId: integer('baseline_generation_run_id')
      .notNull()
      .references(() => baselineGenerationRuns.id, { onDelete: 'cascade' }),
    snapshotJson: text('snapshot_json').notNull(),
    filePath: text('file_path').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('baseline_generation_evidence_snapshots_run_unique_idx').on(
      table.baselineGenerationRunId,
    ),
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
export type Skill = typeof skills.$inferSelect
export type SkillAlias = typeof skillAliases.$inferSelect
export type JobApplicationSkill = typeof jobApplicationsToSkills.$inferSelect

export type { JobStatus } from '../lib/applications/constants'
export type { SkillDecision, SkillImportance, SkillMatchResult, SkillOrigin, SkillReviewStatus }
