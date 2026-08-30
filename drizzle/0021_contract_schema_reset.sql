-- Canonical contract migration: reset authorized derived AI history and rebuild
-- the final schema. Core resources are preserved with their integer IDs; all
-- derived AI tables are recreated empty; job_applications_to_skills is dropped.

DROP TABLE `document_reviews`;
--> statement-breakpoint
DROP TABLE `generated_artifacts`;
--> statement-breakpoint
DROP TABLE `generation_evidence_snapshots`;
--> statement-breakpoint
DROP TABLE `generation_run_results`;
--> statement-breakpoint
DROP TABLE `generation_runs`;
--> statement-breakpoint
DROP TABLE `analysis_run_decisions`;
--> statement-breakpoint
DROP TABLE `application_analysis_runs`;
--> statement-breakpoint
DROP TABLE `job_requirements_to_skills`;
--> statement-breakpoint
DROP TABLE `job_requirements`;
--> statement-breakpoint
DROP TABLE `job_posting_analyses`;
--> statement-breakpoint
DROP TABLE `job_applications_to_skills`;
--> statement-breakpoint
DROP TABLE `baseline_generation_evidence_snapshots`;
--> statement-breakpoint
DROP TABLE `baseline_generated_artifacts`;
--> statement-breakpoint
DROP TABLE `baseline_generation_runs`;
--> statement-breakpoint
ALTER TABLE `skill_categories` RENAME TO `skill_categories_legacy`;
--> statement-breakpoint
ALTER TABLE `skills` RENAME TO `skills_legacy`;
--> statement-breakpoint
ALTER TABLE `skill_aliases` RENAME TO `skill_aliases_legacy`;
--> statement-breakpoint
CREATE TABLE `skill_categories` (
  `key` text PRIMARY KEY NOT NULL,
  `label` text NOT NULL,
  `sort_order` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `key` text NOT NULL,
  `name` text NOT NULL,
  `category` text,
  `review_status` text NOT NULL DEFAULT 'pending',
  `origin` text NOT NULL DEFAULT 'manual',
  `career_skill_id` text,
  `merged_into_skill_id` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`category`) REFERENCES `skill_categories`(`key`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`merged_into_skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `skills_review_status_check` CHECK(`review_status` in ('pending','approved','rejected','merged')),
  CONSTRAINT `skills_origin_check` CHECK(`origin` in ('career-data','job-parser','manual','import')),
  CONSTRAINT `skills_merged_check` CHECK((`review_status` = 'merged' and `merged_into_skill_id` is not null) or (`review_status` != 'merged' and `merged_into_skill_id` is null))
);
--> statement-breakpoint
CREATE TABLE `skill_aliases` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `skill_id` integer NOT NULL,
  `alias` text NOT NULL,
  `normalized_alias` text NOT NULL,
  `origin` text NOT NULL DEFAULT 'manual',
  `created_at` text NOT NULL,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `skill_categories` (`key`, `label`, `sort_order`, `created_at`, `updated_at`)
SELECT `key`, `label`, `sort_order`, `created_at`, `updated_at` FROM `skill_categories_legacy`;
--> statement-breakpoint
INSERT INTO `skills` (`id`, `key`, `name`, `category`, `review_status`, `origin`, `career_skill_id`, `merged_into_skill_id`, `created_at`, `updated_at`)
SELECT `id`, `key`, `name`, `category`, `review_status`, `origin`, `career_skill_id`, `merged_into_skill_id`, `created_at`, `updated_at` FROM `skills_legacy`;
--> statement-breakpoint
INSERT INTO `skill_aliases` (`id`, `skill_id`, `alias`, `normalized_alias`, `origin`, `created_at`)
SELECT `id`, `skill_id`, `alias`, `normalized_alias`, `origin`, `created_at` FROM `skill_aliases_legacy`;
--> statement-breakpoint
DROP TABLE `skill_aliases_legacy`;
--> statement-breakpoint
UPDATE `skills_legacy` SET `review_status` = 'pending', `merged_into_skill_id` = NULL WHERE `review_status` = 'merged';
--> statement-breakpoint
DROP TABLE `skills_legacy`;
--> statement-breakpoint
DROP TABLE `skill_categories_legacy`;
--> statement-breakpoint
CREATE INDEX `skill_categories_sort_order_idx` ON `skill_categories` (`sort_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_key_unique_idx` ON `skills` (`key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_career_skill_id_unique_idx` ON `skills` (`career_skill_id`);
--> statement-breakpoint
CREATE INDEX `skills_review_status_idx` ON `skills` (`review_status`);
--> statement-breakpoint
CREATE INDEX `skills_category_idx` ON `skills` (`category`);
--> statement-breakpoint
CREATE INDEX `skills_origin_idx` ON `skills` (`origin`);
--> statement-breakpoint
CREATE INDEX `skills_merged_into_idx` ON `skills` (`merged_into_skill_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_aliases_normalized_alias_unique_idx` ON `skill_aliases` (`normalized_alias`);
--> statement-breakpoint
CREATE INDEX `skill_aliases_skill_idx` ON `skill_aliases` (`skill_id`);
--> statement-breakpoint
ALTER TABLE `companies` RENAME TO `companies_legacy`;
--> statement-breakpoint
ALTER TABLE `contacts` RENAME TO `contacts_legacy`;
--> statement-breakpoint
ALTER TABLE `job_applications` RENAME TO `job_applications_legacy`;
--> statement-breakpoint
ALTER TABLE `job_postings` RENAME TO `job_postings_legacy`;
--> statement-breakpoint
ALTER TABLE `follow_ups` RENAME TO `follow_ups_legacy`;
--> statement-breakpoint
ALTER TABLE `interviews` RENAME TO `interviews_legacy`;
--> statement-breakpoint
ALTER TABLE `job_applications_to_contacts` RENAME TO `job_applications_to_contacts_legacy`;
--> statement-breakpoint
CREATE TABLE `companies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `website` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `company_id` integer NOT NULL,
  `name` text NOT NULL,
  `email` text,
  `linkedin_url` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `job_applications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `company_id` integer NOT NULL,
  `job_title` text NOT NULL,
  `direction` text NOT NULL DEFAULT 'fullstack',
  `location` text,
  `url` text,
  `posted_date` text NOT NULL,
  `priority` text NOT NULL DEFAULT 'B',
  `applied_date` text,
  `application_source` text,
  `salary` text,
  `notes` text,
  `status` text NOT NULL DEFAULT 'Saved',
  `status_before_archive` text,
  `apply_today_target_date` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `priority_check` CHECK(`priority` in ('A','B','C')),
  CONSTRAINT `status_check` CHECK(`status` in ('Saved','Apply Today','Applied','Follow Up','Interviewing','Rejected','Archived')),
  CONSTRAINT `status_before_archive_check` CHECK(`status` = 'Archived' or `status_before_archive` is null),
  CONSTRAINT `apply_today_target_check` CHECK(`status` != 'Apply Today' or `apply_today_target_date` is not null)
);
--> statement-breakpoint
CREATE TABLE `job_postings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_application_id` integer NOT NULL,
  `version` integer NOT NULL DEFAULT 1,
  `raw_text` text NOT NULL,
  `captured_at` text NOT NULL,
  `content_hash` text NOT NULL,
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `job_postings_version_check` CHECK(`version` > 0)
);
--> statement-breakpoint
CREATE TABLE `follow_ups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_application_id` integer NOT NULL,
  `action_date` text NOT NULL,
  `action_type` text NOT NULL,
  `notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `interviews` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_application_id` integer NOT NULL,
  `interview_date` text NOT NULL,
  `round_name` text NOT NULL,
  `round_type` text NOT NULL,
  `notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `job_applications_to_contacts` (
  `job_application_id` integer NOT NULL,
  `contact_id` integer NOT NULL,
  `relationship_type` text,
  `is_primary` integer,
  `notes` text,
  `created_at` text,
  PRIMARY KEY(`job_application_id`, `contact_id`),
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `companies` (`id`, `name`, `website`, `created_at`, `updated_at`)
SELECT `id`, `name`, `website`, `created_at`, COALESCE(`updated_at`, `created_at`) FROM `companies_legacy`;
--> statement-breakpoint
INSERT INTO `contacts` (`id`, `company_id`, `name`, `email`, `linkedin_url`, `created_at`, `updated_at`)
SELECT `c`.`id`, `c`.`company_id`, `c`.`name`, `c`.`email`, `c`.`linkedin_url`,
       COALESCE(`c`.`created_at`, `co`.`created_at`),
       COALESCE(`c`.`updated_at`, `c`.`created_at`, `co`.`created_at`)
FROM `contacts_legacy` AS `c`
INNER JOIN `companies_legacy` AS `co` ON `co`.`id` = `c`.`company_id`;
--> statement-breakpoint
INSERT INTO `job_applications` (
  `id`, `company_id`, `job_title`, `direction`, `location`, `url`, `posted_date`, `priority`,
  `applied_date`, `application_source`, `salary`, `notes`, `status`, `status_before_archive`,
  `apply_today_target_date`, `created_at`, `updated_at`
)
SELECT
  `id`, `company_id`, `job_title`, `direction`, `location`, `url`, `posted_date`, `priority`,
  `applied_date`, `application_source`, `salary`, `notes`, `status`,
  CASE WHEN `status` = 'Archived' THEN `status_before_archive` ELSE NULL END,
  CASE WHEN `status` = 'Apply Today' THEN COALESCE(`apply_today_target_date`, `posted_date`) ELSE `apply_today_target_date` END,
  `created_at`, `updated_at`
FROM `job_applications_legacy`;
--> statement-breakpoint
INSERT INTO `job_postings` (`id`, `job_application_id`, `version`, `raw_text`, `captured_at`, `content_hash`)
SELECT `id`, `job_application_id`, `version`, `raw_text`, `captured_at`, `content_hash` FROM `job_postings_legacy`;
--> statement-breakpoint
INSERT INTO `follow_ups` (`id`, `job_application_id`, `action_date`, `action_type`, `notes`, `created_at`, `updated_at`)
SELECT `id`, `job_application_id`, `action_date`, COALESCE(`action_type`, 'other'), `notes`,
       COALESCE(`created_at`, `action_date`), COALESCE(`updated_at`, `action_date`)
FROM `follow_ups_legacy`;
--> statement-breakpoint
INSERT INTO `interviews` (`id`, `job_application_id`, `interview_date`, `round_name`, `round_type`, `notes`, `created_at`, `updated_at`)
SELECT `id`, `job_application_id`, `interview_date`, `round_name`, COALESCE(`round_type`, 'other'), `notes`,
       COALESCE(`created_at`, `interview_date`), COALESCE(`updated_at`, `interview_date`)
FROM `interviews_legacy`;
--> statement-breakpoint
INSERT INTO `job_applications_to_contacts` (
  `job_application_id`, `contact_id`, `relationship_type`, `is_primary`, `notes`, `created_at`
)
SELECT `job_application_id`, `contact_id`, `relationship_type`, `is_primary`, `notes`, `created_at`
FROM `job_applications_to_contacts_legacy`;
--> statement-breakpoint
DROP TABLE `job_postings_legacy`;
--> statement-breakpoint
DROP TABLE `follow_ups_legacy`;
--> statement-breakpoint
DROP TABLE `interviews_legacy`;
--> statement-breakpoint
DROP TABLE `job_applications_to_contacts_legacy`;
--> statement-breakpoint
DROP TABLE `job_applications_legacy`;
--> statement-breakpoint
DROP TABLE `contacts_legacy`;
--> statement-breakpoint
DROP TABLE `companies_legacy`;
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_nocase_idx` ON `companies` (lower(`name`));
--> statement-breakpoint
CREATE INDEX `contacts_company_idx` ON `contacts` (`company_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_company_email_nocase_idx` ON `contacts` (`company_id`, lower(`email`));
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `job_applications` (`status`);
--> statement-breakpoint
CREATE INDEX `jobs_priority_idx` ON `job_applications` (`priority`);
--> statement-breakpoint
CREATE INDEX `jobs_company_idx` ON `job_applications` (`company_id`);
--> statement-breakpoint
CREATE INDEX `jobs_posted_date_idx` ON `job_applications` (`posted_date`);
--> statement-breakpoint
CREATE INDEX `jobs_applied_date_idx` ON `job_applications` (`applied_date`);
--> statement-breakpoint
CREATE INDEX `jobs_target_date_idx` ON `job_applications` (`apply_today_target_date`);
--> statement-breakpoint
CREATE INDEX `jobs_status_updated_idx` ON `job_applications` (`status`, `updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_postings_application_version_unique_idx` ON `job_postings` (`job_application_id`, `version`);
--> statement-breakpoint
CREATE INDEX `job_postings_application_hash_idx` ON `job_postings` (`job_application_id`, `content_hash`);
--> statement-breakpoint
CREATE INDEX `job_postings_content_hash_idx` ON `job_postings` (`content_hash`);
--> statement-breakpoint
CREATE INDEX `follow_ups_job_date_idx` ON `follow_ups` (`job_application_id`, `action_date`);
--> statement-breakpoint
CREATE INDEX `interviews_job_date_idx` ON `interviews` (`job_application_id`, `interview_date`);
--> statement-breakpoint
CREATE INDEX `job_applications_to_contacts_contact_idx` ON `job_applications_to_contacts` (`contact_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_applications_to_contacts_primary_unique_idx` ON `job_applications_to_contacts` (`job_application_id`) WHERE `is_primary` = 1;
--> statement-breakpoint
CREATE TABLE `job_posting_analyses` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_posting_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text,
  `attempts` integer NOT NULL DEFAULT 0,
  `input_hash` text,
  `frozen_input_json` text,
  `result_json` text,
  `model` text,
  `prompt_version` text,
  `schema_version` text,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `job_posting_analyses_status_check` CHECK(`status` in ('Queued','Processing','Completed','Failed')),
  CONSTRAINT `job_posting_analyses_completed_check` CHECK(`status` != 'Completed' or `completed_at` is not null)
);
--> statement-breakpoint
CREATE TABLE `job_requirements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_posting_analysis_id` integer NOT NULL,
  `sequence` integer NOT NULL,
  `requirement_type` text NOT NULL,
  `importance` text NOT NULL,
  `basis` text NOT NULL,
  `statement` text NOT NULL,
  `source_text` text,
  `inference_rationale` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`job_posting_analysis_id`) REFERENCES `job_posting_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `job_requirements_sequence_check` CHECK(`sequence` > 0),
  CONSTRAINT `job_requirements_type_check` CHECK(`requirement_type` in ('skill','experience','responsibility','education','soft-skill','domain')),
  CONSTRAINT `job_requirements_importance_check` CHECK(`importance` in ('required','preferred','mentioned')),
  CONSTRAINT `job_requirements_basis_check` CHECK(`basis` in ('explicit','inferred','legacy')),
  CONSTRAINT `job_requirements_inferred_rationale_check` CHECK(`basis` != 'inferred' or (`inference_rationale` is not null and trim(`inference_rationale`) != '')),
  CONSTRAINT `job_requirements_source_text_check` CHECK(`basis` = 'legacy' or (`source_text` is not null and trim(`source_text`) != ''))
);
--> statement-breakpoint
CREATE TABLE `job_requirements_to_skills` (
  `job_requirement_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  `raw_label` text,
  `confidence` real,
  PRIMARY KEY(`job_requirement_id`, `skill_id`),
  FOREIGN KEY (`job_requirement_id`) REFERENCES `job_requirements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `job_requirements_to_skills_confidence_check` CHECK(`confidence` is null or (`confidence` >= 0 and `confidence` <= 1))
);
--> statement-breakpoint
CREATE TABLE `application_analysis_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_posting_analysis_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `input_hash` text,
  `input_snapshot_json` text,
  `result_json` text,
  `model` text,
  `prompt_version` text,
  `schema_version` text,
  `error_message` text,
  `recommended_profile_id` text,
  `confirmed_profile_id` text,
  `profile_confirmed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  FOREIGN KEY (`job_posting_analysis_id`) REFERENCES `job_posting_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `application_analysis_runs_status_check` CHECK(`status` in ('Queued','Processing','Completed','Failed'))
);
--> statement-breakpoint
CREATE TABLE `analysis_run_decisions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `application_analysis_run_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  `decision` text NOT NULL DEFAULT 'pending',
  `reason` text,
  `previous_decision_id` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`application_analysis_run_id`) REFERENCES `application_analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`previous_decision_id`) REFERENCES `analysis_run_decisions`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `analysis_run_decisions_decision_check` CHECK(`decision` in ('pending','skip','include')),
  CONSTRAINT `analysis_run_decisions_include_reason_check` CHECK(`decision` != 'include' or (`reason` is not null and trim(`reason`) != ''))
);
--> statement-breakpoint
CREATE TABLE `generation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `application_analysis_run_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `input_hash` text,
  `frozen_input_json` text,
  `resume_model` text,
  `cover_letter_model` text,
  `prompt_version` text,
  `schema_version` text,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  FOREIGN KEY (`application_analysis_run_id`) REFERENCES `application_analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `generation_runs_status_check` CHECK(`status` in ('Queued','Processing','Completed','Failed'))
);
--> statement-breakpoint
CREATE TABLE `generated_artifacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `generation_run_id` integer NOT NULL,
  `type` text NOT NULL,
  `file_name` text NOT NULL,
  `file_path` text NOT NULL,
  `mime_type` text NOT NULL,
  `google_drive_file_id` text,
  `google_drive_url` text,
  `google_drive_uploaded_at` text,
  `google_drive_error` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `generated_artifacts_type_check` CHECK(`type` in ('job_context','resume','cover_letter'))
);
--> statement-breakpoint
CREATE TABLE `generation_evidence_snapshots` (
  `generation_run_id` integer PRIMARY KEY NOT NULL,
  `snapshot_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_run_results` (
  `generation_run_id` integer PRIMARY KEY NOT NULL,
  `resume_json` text,
  `cover_letter_json` text,
  `ats_audit_json` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_reviews` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `generation_run_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `input_hash` text,
  `result_json` text,
  `model` text,
  `prompt_version` text,
  `schema_version` text,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `document_reviews_status_check` CHECK(`status` in ('Queued','Processing','Completed','Failed'))
);
--> statement-breakpoint
CREATE TABLE `baseline_generation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `direction` text NOT NULL,
  `target_title` text NOT NULL,
  `target_keywords` text NOT NULL DEFAULT '[]',
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  CONSTRAINT `baseline_generation_runs_status_check` CHECK(`status` in ('Queued','Processing','Completed','Failed'))
);
--> statement-breakpoint
CREATE TABLE `baseline_generated_artifacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `baseline_generation_run_id` integer NOT NULL,
  `type` text NOT NULL,
  `file_name` text NOT NULL,
  `file_path` text NOT NULL,
  `mime_type` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`baseline_generation_run_id`) REFERENCES `baseline_generation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `baseline_generated_artifacts_type_check` CHECK(`type` = 'resume')
);
--> statement-breakpoint
CREATE TABLE `baseline_generation_evidence_snapshots` (
  `baseline_generation_run_id` integer PRIMARY KEY NOT NULL,
  `snapshot_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`baseline_generation_run_id`) REFERENCES `baseline_generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_posting_analyses_queue_job_unique_idx` ON `job_posting_analyses` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `job_posting_analyses_posting_id_idx` ON `job_posting_analyses` (`job_posting_id`, `id`);
--> statement-breakpoint
CREATE INDEX `job_posting_analyses_status_idx` ON `job_posting_analyses` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_posting_analyses_inflight_unique_idx` ON `job_posting_analyses` (`job_posting_id`, `input_hash`) WHERE `status` IN ('Queued', 'Processing');
--> statement-breakpoint
CREATE UNIQUE INDEX `job_requirements_analysis_sequence_unique_idx` ON `job_requirements` (`job_posting_analysis_id`, `sequence`);
--> statement-breakpoint
CREATE INDEX `job_requirements_analysis_idx` ON `job_requirements` (`job_posting_analysis_id`);
--> statement-breakpoint
CREATE INDEX `job_requirements_type_idx` ON `job_requirements` (`requirement_type`);
--> statement-breakpoint
CREATE INDEX `job_requirements_importance_idx` ON `job_requirements` (`importance`);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_analysis_runs_queue_job_unique_idx` ON `application_analysis_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `application_analysis_runs_analysis_created_idx` ON `application_analysis_runs` (`job_posting_analysis_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `application_analysis_runs_status_idx` ON `application_analysis_runs` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_decisions_run_skill_unique_idx` ON `analysis_run_decisions` (`application_analysis_run_id`, `skill_id`);
--> statement-breakpoint
CREATE INDEX `analysis_run_decisions_run_idx` ON `analysis_run_decisions` (`application_analysis_run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_runs_queue_job_unique_idx` ON `generation_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `generation_runs_analysis_created_idx` ON `generation_runs` (`application_analysis_run_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `generation_runs_status_idx` ON `generation_runs` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_runs_inflight_unique_idx` ON `generation_runs` (`application_analysis_run_id`, `input_hash`) WHERE `status` IN ('Queued', 'Processing');
--> statement-breakpoint
CREATE UNIQUE INDEX `generated_artifacts_run_type_unique_idx` ON `generated_artifacts` (`generation_run_id`, `type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_reviews_queue_job_unique_idx` ON `document_reviews` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `document_reviews_run_created_idx` ON `document_reviews` (`generation_run_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `document_reviews_status_idx` ON `document_reviews` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_generation_runs_queue_job_unique_idx` ON `baseline_generation_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `baseline_generation_runs_direction_created_idx` ON `baseline_generation_runs` (`direction`, `created_at`);
--> statement-breakpoint
CREATE INDEX `baseline_generation_runs_status_idx` ON `baseline_generation_runs` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_generated_artifacts_run_type_unique_idx` ON `baseline_generated_artifacts` (`baseline_generation_run_id`, `type`);
