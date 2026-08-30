-- Canonical expand step: add lineage/version/activity columns without removing
-- any legacy storage still read by production code. Only the Job Post
-- application-unique index is dropped; every other legacy column, table, and
-- index remains. Lineage FKs are nullable until the destructive contract
-- migration resets derived history and makes them required.
--
-- Table rebuilds follow the rename-then-drop pattern used by 0011/0012:
-- rename the old table (its indexes follow it), create the new table, copy
-- rows, drop the legacy table, and only then recreate the target indexes so
-- their names are free again.

ALTER TABLE `job_postings` ADD `version` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
DROP INDEX `job_postings_application_unique_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `job_postings_application_version_unique_idx` ON `job_postings` (`job_application_id`, `version`);
--> statement-breakpoint
CREATE INDEX `job_postings_application_hash_idx` ON `job_postings` (`job_application_id`, `content_hash`);
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `result_json` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `job_posting_analyses_inflight_unique_idx` ON `job_posting_analyses` (`job_posting_id`, `input_hash`) WHERE `status` IN ('Queued', 'Processing');
--> statement-breakpoint
ALTER TABLE `companies` ADD `updated_at` text;
--> statement-breakpoint
ALTER TABLE `contacts` ADD `created_at` text;
--> statement-breakpoint
ALTER TABLE `contacts` ADD `updated_at` text;
--> statement-breakpoint
ALTER TABLE `follow_ups` ADD `action_type` text;
--> statement-breakpoint
ALTER TABLE `follow_ups` ADD `created_at` text;
--> statement-breakpoint
ALTER TABLE `follow_ups` ADD `updated_at` text;
--> statement-breakpoint
ALTER TABLE `interviews` ADD `round_type` text;
--> statement-breakpoint
ALTER TABLE `interviews` ADD `created_at` text;
--> statement-breakpoint
ALTER TABLE `interviews` ADD `updated_at` text;
--> statement-breakpoint
ALTER TABLE `job_applications_to_contacts` ADD `relationship_type` text;
--> statement-breakpoint
ALTER TABLE `job_applications_to_contacts` ADD `is_primary` integer;
--> statement-breakpoint
ALTER TABLE `job_applications_to_contacts` ADD `notes` text;
--> statement-breakpoint
ALTER TABLE `job_applications_to_contacts` ADD `created_at` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `job_applications_to_contacts_primary_unique_idx` ON `job_applications_to_contacts` (`job_application_id`) WHERE `is_primary` = 1;
--> statement-breakpoint
ALTER TABLE `job_requirements_to_skills` RENAME TO `job_requirements_to_skills_legacy`;
--> statement-breakpoint
CREATE TABLE `job_requirements_to_skills` (
  `job_requirement_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  `raw_label` text,
  `confidence` real,
  PRIMARY KEY(`job_requirement_id`, `skill_id`),
  FOREIGN KEY (`job_requirement_id`) REFERENCES `job_requirements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `job_requirements_to_skills_confidence_check` CHECK(`confidence` is null or (`confidence` >= 0 and `confidence` <= 1))
);
--> statement-breakpoint
INSERT INTO `job_requirements_to_skills` (`job_requirement_id`, `skill_id`) SELECT `job_requirement_id`, `skill_id` FROM `job_requirements_to_skills_legacy`;
--> statement-breakpoint
DROP TABLE `job_requirements_to_skills_legacy`;
--> statement-breakpoint
ALTER TABLE `application_analysis_runs` RENAME TO `application_analysis_runs_legacy`;
--> statement-breakpoint
ALTER TABLE `analysis_run_decisions` RENAME TO `analysis_run_decisions_legacy`;
--> statement-breakpoint
CREATE TABLE `application_analysis_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_application_id` integer NOT NULL,
  `job_posting_analysis_id` integer,
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
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
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
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`previous_decision_id`) REFERENCES `analysis_run_decisions`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `analysis_run_decisions_decision_check` CHECK(`decision` in ('pending','skip','include')),
  CONSTRAINT `analysis_run_decisions_include_reason_check` CHECK(`decision` != 'include' or (`reason` is not null and trim(`reason`) != ''))
);
--> statement-breakpoint
INSERT INTO `application_analysis_runs` (
  `id`, `job_application_id`, `status`, `queue_job_id`, `attempts`, `input_hash`, `input_snapshot_json`,
  `result_json`, `model`, `prompt_version`, `schema_version`, `error_message`, `recommended_profile_id`,
  `confirmed_profile_id`, `profile_confirmed_at`, `created_at`, `updated_at`, `started_at`, `completed_at`
)
SELECT
  `id`, `job_application_id`, `status`, `queue_job_id`, `attempts`, `input_hash`, `input_snapshot_json`,
  `result_json`, `model`, `prompt_version`, `schema_version`, `error_message`, `recommended_profile_id`,
  `confirmed_profile_id`, `profile_confirmed_at`, `created_at`, `updated_at`, `started_at`, `completed_at`
FROM `application_analysis_runs_legacy`;
--> statement-breakpoint
INSERT INTO `analysis_run_decisions` (
  `id`, `application_analysis_run_id`, `skill_id`, `decision`, `reason`, `previous_decision_id`, `created_at`, `updated_at`
)
SELECT
  `id`, `application_analysis_run_id`, `skill_id`, `decision`, `reason`, `previous_decision_id`, `created_at`, `updated_at`
FROM `analysis_run_decisions_legacy`;
--> statement-breakpoint
DROP TABLE `analysis_run_decisions_legacy`;
--> statement-breakpoint
DROP TABLE `application_analysis_runs_legacy`;
--> statement-breakpoint
CREATE UNIQUE INDEX `application_analysis_runs_queue_job_unique_idx` ON `application_analysis_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `application_analysis_runs_application_created_idx` ON `application_analysis_runs` (`job_application_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `application_analysis_runs_status_idx` ON `application_analysis_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `application_analysis_runs_job_posting_analysis_idx` ON `application_analysis_runs` (`job_posting_analysis_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_decisions_run_skill_unique_idx` ON `analysis_run_decisions` (`application_analysis_run_id`, `skill_id`);
--> statement-breakpoint
CREATE INDEX `analysis_run_decisions_run_idx` ON `analysis_run_decisions` (`application_analysis_run_id`);
--> statement-breakpoint
ALTER TABLE `generation_runs` RENAME TO `generation_runs_legacy`;
--> statement-breakpoint
ALTER TABLE `generated_artifacts` RENAME TO `generated_artifacts_legacy`;
--> statement-breakpoint
ALTER TABLE `generation_evidence_snapshots` RENAME TO `generation_evidence_snapshots_legacy`;
--> statement-breakpoint
ALTER TABLE `generation_run_results` RENAME TO `generation_run_results_legacy`;
--> statement-breakpoint
ALTER TABLE `document_reviews` RENAME TO `document_reviews_legacy`;
--> statement-breakpoint
CREATE TABLE `generation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_application_id` integer NOT NULL,
  `application_analysis_run_id` integer,
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
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
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
  CONSTRAINT `generated_artifacts_type_check` CHECK(`type` in ('job_context', 'resume', 'cover_letter'))
);
--> statement-breakpoint
CREATE TABLE `generation_evidence_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `generation_run_id` integer NOT NULL,
  `snapshot_json` text NOT NULL,
  `file_path` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_run_results` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `generation_run_id` integer NOT NULL,
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
INSERT INTO `generation_runs` (
  `id`, `job_application_id`, `status`, `queue_job_id`, `attempts`, `input_hash`, `frozen_input_json`,
  `resume_model`, `cover_letter_model`, `prompt_version`, `schema_version`, `error_message`,
  `created_at`, `updated_at`, `started_at`, `completed_at`
)
SELECT
  `id`, `job_application_id`, `status`, `queue_job_id`, `attempts`, `input_hash`, `frozen_input_json`,
  `resume_model`, `cover_letter_model`, `prompt_version`, `schema_version`, `error_message`,
  `created_at`, `updated_at`, `started_at`, `completed_at`
FROM `generation_runs_legacy`;
--> statement-breakpoint
INSERT INTO `generated_artifacts` (
  `id`, `generation_run_id`, `type`, `file_name`, `file_path`, `mime_type`, `google_drive_file_id`,
  `google_drive_url`, `google_drive_uploaded_at`, `google_drive_error`, `created_at`
)
SELECT
  `id`, `generation_run_id`, `type`, `file_name`, `file_path`, `mime_type`, `google_drive_file_id`,
  `google_drive_url`, `google_drive_uploaded_at`, `google_drive_error`, `created_at`
FROM `generated_artifacts_legacy`;
--> statement-breakpoint
INSERT INTO `generation_evidence_snapshots` (`id`, `generation_run_id`, `snapshot_json`, `file_path`, `created_at`)
SELECT `id`, `generation_run_id`, `snapshot_json`, `file_path`, `created_at` FROM `generation_evidence_snapshots_legacy`;
--> statement-breakpoint
INSERT INTO `generation_run_results` (
  `id`, `generation_run_id`, `resume_json`, `cover_letter_json`, `ats_audit_json`, `created_at`, `updated_at`
)
SELECT
  `id`, `generation_run_id`, `resume_json`, `cover_letter_json`, `ats_audit_json`, `created_at`, `updated_at`
FROM `generation_run_results_legacy`;
--> statement-breakpoint
INSERT INTO `document_reviews` (
  `id`, `generation_run_id`, `status`, `queue_job_id`, `attempts`, `input_hash`, `result_json`, `model`,
  `prompt_version`, `schema_version`, `error_message`, `created_at`, `updated_at`, `started_at`, `completed_at`
)
SELECT
  `id`, `generation_run_id`, `status`, `queue_job_id`, `attempts`, `input_hash`, `result_json`, `model`,
  `prompt_version`, `schema_version`, `error_message`, `created_at`, `updated_at`, `started_at`, `completed_at`
FROM `document_reviews_legacy`;
--> statement-breakpoint
DROP TABLE `generated_artifacts_legacy`;
--> statement-breakpoint
DROP TABLE `generation_evidence_snapshots_legacy`;
--> statement-breakpoint
DROP TABLE `generation_run_results_legacy`;
--> statement-breakpoint
DROP TABLE `document_reviews_legacy`;
--> statement-breakpoint
DROP TABLE `generation_runs_legacy`;
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_runs_queue_job_unique_idx` ON `generation_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `generation_runs_application_created_idx` ON `generation_runs` (`job_application_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `generation_runs_status_idx` ON `generation_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `generation_runs_application_analysis_run_idx` ON `generation_runs` (`application_analysis_run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_runs_inflight_unique_idx` ON `generation_runs` (`application_analysis_run_id`, `input_hash`) WHERE `status` IN ('Queued', 'Processing') AND `application_analysis_run_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `generated_artifacts_run_type_unique_idx` ON `generated_artifacts` (`generation_run_id`, `type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_evidence_snapshots_run_unique_idx` ON `generation_evidence_snapshots` (`generation_run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_run_results_run_unique_idx` ON `generation_run_results` (`generation_run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_reviews_queue_job_unique_idx` ON `document_reviews` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `document_reviews_run_created_idx` ON `document_reviews` (`generation_run_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `document_reviews_status_idx` ON `document_reviews` (`status`);
