-- Schema simplification (51 -> 39 physical tables) plus career-data-preserving
-- restructuring. The owner confirmed that job-search history is disposable while
-- every career fact must be preserved, which makes it safe to rebuild the
-- operational tables instead of migrating their rows.
--
-- Preserved exactly: career_profile content (from career_candidate +
-- career_preferences), career_state, education, experiences, achievements,
-- projects, stories, publications, portfolio topics, personal skills,
-- directions, Base Resume versions, the catalog (skills/categories/aliases) and
-- every career junction — including all 104 direction links moved into the new
-- career_record_directions table.
--
-- Discarded: job-search operational rows (companies, contacts, applications,
-- postings, analyses, requirements, mappings, mentions, decisions, generation
-- runs, artifacts, reviews, intake, follow-ups, interviews) and the 25
-- unreferenced job-parser catalog leftovers. Google Drive credentials and the
-- artifact files on disk are deliberately kept.

-- 1. Clear the disposable operational history first, so the table rebuilds below
--    cannot violate foreign keys. Children before parents; cascades finish the
--    job. google_drive_connections is intentionally untouched.
DELETE FROM `analysis_run_decisions`;
--> statement-breakpoint
DELETE FROM `generated_artifacts`;
--> statement-breakpoint
DELETE FROM `document_reviews`;
--> statement-breakpoint
DELETE FROM `generation_runs`;
--> statement-breakpoint
DELETE FROM `application_analysis_runs`;
--> statement-breakpoint
DELETE FROM `job_requirements_to_skills`;
--> statement-breakpoint
DELETE FROM `job_requirement_skill_mentions`;
--> statement-breakpoint
DELETE FROM `job_requirements`;
--> statement-breakpoint
DELETE FROM `job_posting_analyses`;
--> statement-breakpoint
DELETE FROM `job_postings`;
--> statement-breakpoint
DELETE FROM `job_applications_to_contacts`;
--> statement-breakpoint
DELETE FROM `job_applications`;
--> statement-breakpoint
DELETE FROM `contacts`;
--> statement-breakpoint
DELETE FROM `companies`;
--> statement-breakpoint
DELETE FROM `job_intake_items`;
--> statement-breakpoint
DELETE FROM `job_intake_batches`;
--> statement-breakpoint
DELETE FROM `follow_ups`;
--> statement-breakpoint
DELETE FROM `interviews`;
--> statement-breakpoint
DELETE FROM `baseline_generation_evidence_snapshots`;
--> statement-breakpoint
DELETE FROM `baseline_generation_results`;
--> statement-breakpoint
DELETE FROM `baseline_generated_artifacts`;
--> statement-breakpoint
DELETE FROM `baseline_generation_runs`;
--> statement-breakpoint
-- 2. Rebuild generation_runs as a single table for both pipelines: `kind`
--    discriminates application vs baseline runs, and the former 1:1 result and
--    evidence-snapshot side tables become columns here.
DROP TABLE `generation_runs`;
--> statement-breakpoint
CREATE TABLE `generation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `kind` text NOT NULL DEFAULT 'application',
  `application_analysis_run_id` integer,
  `input_hash` text,
  `frozen_input_json` text,
  `baseline_json` text,
  `evidence_snapshot_json` text,
  `resume_json` text,
  `cover_letter_json` text,
  `ats_audit_json` text,
  `resume_markdown` text,
  `cover_letter_markdown` text,
  `draft_validation_json` text,
  `renderer_version` text,
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
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
  CONSTRAINT `generation_runs_kind_check` CHECK(`kind` in ('application','baseline')),
  CONSTRAINT `generation_runs_status_check` CHECK(`status` in ('Queued','Processing','Completed','Failed')),
  CONSTRAINT `generation_runs_completed_check` CHECK(`status` != 'Completed' or `completed_at` is not null),
  CONSTRAINT `generation_runs_kind_source_check` CHECK((`kind` = 'application' and `application_analysis_run_id` is not null) or (`kind` = 'baseline' and `application_analysis_run_id` is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_runs_queue_job_unique_idx` ON `generation_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `generation_runs_analysis_created_idx` ON `generation_runs` (`application_analysis_run_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `generation_runs_status_idx` ON `generation_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `generation_runs_kind_idx` ON `generation_runs` (`kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_runs_inflight_unique_idx` ON `generation_runs` (`application_analysis_run_id`, `input_hash`) WHERE `status` IN ('Queued', 'Processing') AND `kind` = 'application';
--> statement-breakpoint
-- 3. The six tables folded into generation_runs or into each other.
DROP TABLE `baseline_generation_evidence_snapshots`;
--> statement-breakpoint
DROP TABLE `baseline_generation_results`;
--> statement-breakpoint
DROP TABLE `baseline_generated_artifacts`;
--> statement-breakpoint
DROP TABLE `baseline_generation_runs`;
--> statement-breakpoint
DROP TABLE `generation_run_results`;
--> statement-breakpoint
DROP TABLE `generation_evidence_snapshots`;
--> statement-breakpoint
-- 4. Merge the two career singletons into career_profile, preserving the rows.
CREATE TABLE `career_profile` (
  `id` integer PRIMARY KEY NOT NULL,
  `full_name` text NOT NULL DEFAULT '',
  `email` text,
  `phone` text,
  `location` text,
  `website` text,
  `linkedin_url` text,
  `github_url` text,
  `authorization_json` text,
  `career_break_json` text,
  `truthfulness_json` text,
  `locations_json` text NOT NULL DEFAULT '[]',
  `work_modes_json` text NOT NULL DEFAULT '[]',
  `availability` text,
  `compensation_json` text,
  `notes` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_profile_singleton_check` CHECK(`id` = 1),
  CONSTRAINT `career_profile_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
INSERT INTO `career_profile` (
  `id`, `full_name`, `email`, `phone`, `location`, `website`, `linkedin_url`, `github_url`,
  `authorization_json`, `career_break_json`, `truthfulness_json`,
  `locations_json`, `work_modes_json`, `availability`, `compensation_json`, `notes`,
  `revision`, `created_at`, `updated_at`
)
SELECT
  1,
  COALESCE(`c`.`full_name`, ''),
  `c`.`email`, `c`.`phone`, `c`.`location`, `c`.`website`, `c`.`linkedin_url`, `c`.`github_url`,
  `c`.`authorization_json`, `c`.`career_break_json`, `c`.`truthfulness_json`,
  COALESCE(`p`.`locations_json`, '[]'), COALESCE(`p`.`work_modes_json`, '[]'),
  `p`.`availability`, `p`.`compensation_json`, `p`.`notes`,
  MAX(COALESCE(`c`.`revision`, 1), COALESCE(`p`.`revision`, 1)),
  COALESCE(`c`.`created_at`, `p`.`created_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(`c`.`updated_at`, `p`.`updated_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM (SELECT 1 AS `one`) AS `anchor`
LEFT JOIN `career_candidate` AS `c` ON `c`.`id` = 1
LEFT JOIN `career_preferences` AS `p` ON `p`.`id` = 1
WHERE `c`.`id` IS NOT NULL OR `p`.`id` IS NOT NULL;
--> statement-breakpoint
DROP TABLE `career_candidate`;
--> statement-breakpoint
DROP TABLE `career_preferences`;
--> statement-breakpoint
-- 5. One exclusive-arc junction for every record-to-direction link, replacing
--    five identical tables while keeping real foreign keys: exactly one record
--    column may be set, and the partial unique indexes keep each record's
--    direction list unique. Editorial order (`position`) is preserved.
CREATE TABLE `career_record_directions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `direction_key` text NOT NULL,
  `achievement_id` integer,
  `project_id` integer,
  `story_id` integer,
  `publication_id` integer,
  `topic_id` integer,
  `position` integer NOT NULL DEFAULT 0,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`achievement_id`) REFERENCES `career_achievements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `career_projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`story_id`) REFERENCES `career_stories`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`publication_id`) REFERENCES `career_publications`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`topic_id`) REFERENCES `career_portfolio_topics`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `career_record_directions_exactly_one_check` CHECK((`achievement_id` is not null) + (`project_id` is not null) + (`story_id` is not null) + (`publication_id` is not null) + (`topic_id` is not null) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_achievement_unique_idx` ON `career_record_directions` (`achievement_id`, `direction_key`) WHERE `achievement_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_project_unique_idx` ON `career_record_directions` (`project_id`, `direction_key`) WHERE `project_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_story_unique_idx` ON `career_record_directions` (`story_id`, `direction_key`) WHERE `story_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_publication_unique_idx` ON `career_record_directions` (`publication_id`, `direction_key`) WHERE `publication_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_topic_unique_idx` ON `career_record_directions` (`topic_id`, `direction_key`) WHERE `topic_id` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `career_record_directions` (`direction_key`, `achievement_id`, `position`)
SELECT `direction_key`, `achievement_id`, `position` FROM `career_achievement_directions`;
--> statement-breakpoint
INSERT INTO `career_record_directions` (`direction_key`, `project_id`, `position`)
SELECT `direction_key`, `project_id`, `position` FROM `career_project_directions`;
--> statement-breakpoint
INSERT INTO `career_record_directions` (`direction_key`, `story_id`, `position`)
SELECT `direction_key`, `story_id`, `position` FROM `career_story_directions`;
--> statement-breakpoint
INSERT INTO `career_record_directions` (`direction_key`, `publication_id`, `position`)
SELECT `direction_key`, `publication_id`, `position` FROM `career_publication_directions`;
--> statement-breakpoint
INSERT INTO `career_record_directions` (`direction_key`, `topic_id`, `position`)
SELECT `direction_key`, `topic_id`, `position` FROM `career_portfolio_topic_directions`;
--> statement-breakpoint
DROP TABLE `career_achievement_directions`;
--> statement-breakpoint
DROP TABLE `career_project_directions`;
--> statement-breakpoint
DROP TABLE `career_story_directions`;
--> statement-breakpoint
DROP TABLE `career_publication_directions`;
--> statement-breakpoint
DROP TABLE `career_portfolio_topic_directions`;
--> statement-breakpoint
-- 6. Requirement-to-skill mapping is now derived from the mentions that own it,
--    so the physical duplicate table (and its double write) is replaced by a
--    read-only view with the same name and columns. Nothing references it by
--    foreign key, and the older rows it held were cleared above.
DROP TABLE `job_requirements_to_skills`;
--> statement-breakpoint
CREATE VIEW `job_requirements_to_skills` AS
SELECT
  `job_requirement_id`,
  `resolved_skill_id` AS `skill_id`,
  `raw_term` AS `raw_label`,
  CAST(json_extract(`occurrences_json`, '$[0].confidence') AS REAL) AS `confidence`
FROM `job_requirement_skill_mentions`
WHERE `mapping_state` = 'mapped' AND `resolved_skill_id` IS NOT NULL;
--> statement-breakpoint
-- 7. Indexes no query can use: reverse-lookup indexes on the surviving
--    junction tables (every read filters the leading primary-key column),
--    a mentions index fully covered by its unique index, `skills.origin` which
--    is only ever compared in memory, and four non-unique indexes whose columns
--    are the leading prefix of a longer index on the same table.
DROP INDEX `career_achievement_skills_skill_idx`;
--> statement-breakpoint
DROP INDEX `career_project_skills_skill_idx`;
--> statement-breakpoint
DROP INDEX `career_publication_projects_project_idx`;
--> statement-breakpoint
DROP INDEX `career_achievement_publications_publication_idx`;
--> statement-breakpoint
DROP INDEX `career_portfolio_topic_projects_project_idx`;
--> statement-breakpoint
DROP INDEX `job_requirement_skill_mentions_requirement_idx`;
--> statement-breakpoint
DROP INDEX `skills_origin_idx`;
--> statement-breakpoint
DROP INDEX `contacts_company_idx`;
--> statement-breakpoint
DROP INDEX `jobs_status_idx`;
--> statement-breakpoint
DROP INDEX `job_requirements_analysis_idx`;
--> statement-breakpoint
DROP INDEX `analysis_run_decisions_run_idx`;
--> statement-breakpoint
DROP INDEX `job_intake_items_batch_idx`;
--> statement-breakpoint
-- 8. Two columns of job_applications_to_contacts are referenced nowhere in the
--    codebase (neither property nor column name). The partial unique index on
--    `is_primary` has to go first, because a WHERE clause blocks DROP COLUMN.
DROP INDEX `job_applications_to_contacts_primary_unique_idx`;
--> statement-breakpoint
ALTER TABLE `job_applications_to_contacts` DROP COLUMN `relationship_type`;
--> statement-breakpoint
ALTER TABLE `job_applications_to_contacts` DROP COLUMN `is_primary`;
--> statement-breakpoint
-- 9. Remove the catalog leftovers derived from past job parsing. Only rows that
--    no career record references are deleted, so no career evidence link can be
--    broken; the guard also protects any merge target.
DELETE FROM `skills`
WHERE `origin` != 'career-data'
  AND `id` NOT IN (
    SELECT `skill_id` FROM `career_skills`
    UNION SELECT `skill_id` FROM `career_achievement_skills`
    UNION SELECT `skill_id` FROM `career_project_skills`
  )
  AND `id` NOT IN (
    SELECT `merged_into_skill_id` FROM `skills` WHERE `merged_into_skill_id` IS NOT NULL
  );
