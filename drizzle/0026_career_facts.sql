-- Database-owned career facts, curated personal skills, direction/generation
-- preferences, immutable Base Resume versions and requirement-owned skill
-- mentions.
--
-- Additive only: no existing table is dropped, recreated or rewritten, so
-- analyses, artifacts, job application history, OAuth metadata and the existing
-- job skill mappings are preserved. The catalog tables (skill_categories,
-- skills, skill_aliases) are reused as-is. `job_applications.direction` stays
-- free text: legacy operational directions are reconciled before any restrictive
-- foreign key can be added.

CREATE TABLE `career_candidate` (
  `id` integer PRIMARY KEY NOT NULL,
  `full_name` text NOT NULL,
  `email` text,
  `phone` text,
  `location` text,
  `website` text,
  `linkedin_url` text,
  `github_url` text,
  `authorization_json` text,
  `career_break_json` text,
  `truthfulness_json` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_candidate_singleton_check` CHECK(`id` = 1),
  CONSTRAINT `career_candidate_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE TABLE `career_preferences` (
  `id` integer PRIMARY KEY NOT NULL,
  `locations_json` text NOT NULL DEFAULT '[]',
  `work_modes_json` text NOT NULL DEFAULT '[]',
  `availability` text,
  `compensation_json` text,
  `notes` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_preferences_singleton_check` CHECK(`id` = 1),
  CONSTRAINT `career_preferences_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE TABLE `career_state` (
  `id` integer PRIMARY KEY NOT NULL,
  `revision` integer NOT NULL DEFAULT 0,
  `content_hash` text NOT NULL DEFAULT '',
  `legacy_documents_json` text,
  `extension_json` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_state_singleton_check` CHECK(`id` = 1),
  CONSTRAINT `career_state_revision_check` CHECK(`revision` >= 0)
);
--> statement-breakpoint
CREATE TABLE `career_directions` (
  `key` text PRIMARY KEY NOT NULL,
  `label` text NOT NULL,
  `target_titles_json` text NOT NULL DEFAULT '[]',
  `rules_json` text,
  `sort_order` integer NOT NULL DEFAULT 0,
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_directions_key_check` CHECK(length(trim(`key`)) > 0),
  CONSTRAINT `career_directions_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE INDEX `career_directions_sort_order_idx` ON `career_directions` (`sort_order`);
--> statement-breakpoint
CREATE TABLE `career_education` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stable_key` text NOT NULL,
  `degree` text NOT NULL,
  `school` text NOT NULL,
  `start_date` text,
  `end_date` text,
  `date_precision` text NOT NULL DEFAULT 'day',
  `display_dates` text,
  `year` integer,
  `sort_order` integer NOT NULL DEFAULT 0,
  `coursework_json` text NOT NULL DEFAULT '[]',
  `details_json` text,
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_education_date_precision_check` CHECK(`date_precision` in ('day','month','year')),
  CONSTRAINT `career_education_year_check` CHECK(`year` is null or (`year` >= 1900 and `year` <= 2100)),
  CONSTRAINT `career_education_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_education_stable_key_unique_idx` ON `career_education` (`stable_key`);
--> statement-breakpoint
CREATE INDEX `career_education_sort_order_idx` ON `career_education` (`sort_order`);
--> statement-breakpoint
CREATE TABLE `career_experiences` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stable_key` text NOT NULL,
  `company` text NOT NULL,
  `role` text NOT NULL,
  `employment_nature` text,
  `start_date` text,
  `end_date` text,
  `date_precision` text NOT NULL DEFAULT 'day',
  `display_dates` text,
  `sort_order` integer NOT NULL DEFAULT 0,
  `context` text,
  `responsibilities_json` text NOT NULL DEFAULT '[]',
  `extension_json` text,
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_experiences_date_precision_check` CHECK(`date_precision` in ('day','month','year')),
  CONSTRAINT `career_experiences_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_experiences_stable_key_unique_idx` ON `career_experiences` (`stable_key`);
--> statement-breakpoint
CREATE INDEX `career_experiences_sort_order_idx` ON `career_experiences` (`sort_order`);
--> statement-breakpoint
CREATE TABLE `career_achievements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stable_key` text NOT NULL,
  `experience_id` integer,
  `claim` text NOT NULL,
  `safe_to_use` integer NOT NULL DEFAULT 1,
  `evidence_json` text NOT NULL DEFAULT '[]',
  `evidence_narratives_json` text NOT NULL DEFAULT '[]',
  `limitations_json` text NOT NULL DEFAULT '[]',
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`experience_id`) REFERENCES `career_experiences`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `career_achievements_safe_check` CHECK(`safe_to_use` in (0,1)),
  CONSTRAINT `career_achievements_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_achievements_stable_key_unique_idx` ON `career_achievements` (`stable_key`);
--> statement-breakpoint
CREATE INDEX `career_achievements_experience_idx` ON `career_achievements` (`experience_id`);
--> statement-breakpoint
CREATE TABLE `career_projects` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stable_key` text NOT NULL,
  `name` text NOT NULL,
  `experience_id` integer,
  `ownership` text,
  `eligibility` text NOT NULL DEFAULT 'resume-eligible',
  `completion` text,
  `urls_json` text NOT NULL DEFAULT '[]',
  `safe_wording` text,
  `limitations_json` text NOT NULL DEFAULT '[]',
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`experience_id`) REFERENCES `career_experiences`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `career_projects_eligibility_check` CHECK(`eligibility` in ('resume-eligible','not-eligible')),
  CONSTRAINT `career_projects_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_projects_stable_key_unique_idx` ON `career_projects` (`stable_key`);
--> statement-breakpoint
CREATE INDEX `career_projects_experience_idx` ON `career_projects` (`experience_id`);
--> statement-breakpoint
CREATE TABLE `career_stories` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stable_key` text NOT NULL,
  `experience_id` integer,
  `title` text NOT NULL,
  `context` text,
  `situation` text,
  `task` text,
  `action` text,
  `result` text,
  `narrative` text,
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`experience_id`) REFERENCES `career_experiences`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `career_stories_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_stories_stable_key_unique_idx` ON `career_stories` (`stable_key`);
--> statement-breakpoint
CREATE INDEX `career_stories_experience_idx` ON `career_stories` (`experience_id`);
--> statement-breakpoint
CREATE TABLE `career_publications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stable_key` text NOT NULL,
  `title` text NOT NULL,
  `citation` text NOT NULL,
  `year` integer NOT NULL,
  `status` text NOT NULL,
  `safe_to_use` integer NOT NULL DEFAULT 1,
  `experience_id` integer,
  `authors_json` text NOT NULL DEFAULT '[]',
  `author_list_truncated` integer NOT NULL DEFAULT 0,
  `contributions_json` text NOT NULL DEFAULT '[]',
  `source_urls_json` text NOT NULL DEFAULT '[]',
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`experience_id`) REFERENCES `career_experiences`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `career_publications_year_check` CHECK(`year` >= 1900 and `year` <= 2100),
  CONSTRAINT `career_publications_status_check` CHECK(`status` in ('published','in-review','preprint','needs-verification')),
  CONSTRAINT `career_publications_safe_check` CHECK(`safe_to_use` in (0,1)),
  CONSTRAINT `career_publications_truncated_check` CHECK(`author_list_truncated` in (0,1)),
  CONSTRAINT `career_publications_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_publications_stable_key_unique_idx` ON `career_publications` (`stable_key`);
--> statement-breakpoint
CREATE INDEX `career_publications_experience_idx` ON `career_publications` (`experience_id`);
--> statement-breakpoint
CREATE TABLE `career_skills` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `skill_id` integer NOT NULL,
  `level` text,
  `resume_eligible` integer NOT NULL DEFAULT 1,
  `explanation` text,
  `notes` text,
  `evidence_json` text NOT NULL DEFAULT '[]',
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `career_skills_resume_eligible_check` CHECK(`resume_eligible` in (0,1)),
  CONSTRAINT `career_skills_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_skills_skill_unique_idx` ON `career_skills` (`skill_id`);
--> statement-breakpoint
CREATE TABLE `career_portfolio_topics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stable_key` text NOT NULL,
  `title` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft',
  `sort_order` integer NOT NULL DEFAULT 0,
  `outline_json` text NOT NULL DEFAULT '[]',
  `details_json` text,
  `retired_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `career_portfolio_topics_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_portfolio_topics_stable_key_unique_idx` ON `career_portfolio_topics` (`stable_key`);
--> statement-breakpoint
CREATE INDEX `career_portfolio_topics_sort_order_idx` ON `career_portfolio_topics` (`sort_order`);
--> statement-breakpoint
CREATE TABLE `career_base_resumes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `direction_key` text NOT NULL,
  `version` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft',
  `markdown` text NOT NULL,
  `content_hash` text NOT NULL,
  `approved_at` text,
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `career_base_resumes_status_check` CHECK(`status` in ('draft','approved','superseded')),
  CONSTRAINT `career_base_resumes_approved_at_check` CHECK(`status` != 'approved' or `approved_at` is not null),
  CONSTRAINT `career_base_resumes_markdown_check` CHECK(length(trim(`markdown`)) > 0),
  CONSTRAINT `career_base_resumes_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_base_resumes_direction_version_unique_idx` ON `career_base_resumes` (`direction_key`, `version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_base_resumes_approved_unique_idx` ON `career_base_resumes` (`direction_key`) WHERE `status` = 'approved';
--> statement-breakpoint
CREATE INDEX `career_base_resumes_direction_status_idx` ON `career_base_resumes` (`direction_key`, `status`);
--> statement-breakpoint
CREATE TABLE `career_achievement_skills` (
  `achievement_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`achievement_id`, `skill_id`),
  FOREIGN KEY (`achievement_id`) REFERENCES `career_achievements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `career_achievement_skills_skill_idx` ON `career_achievement_skills` (`skill_id`);
--> statement-breakpoint
CREATE TABLE `career_project_skills` (
  `project_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`project_id`, `skill_id`),
  FOREIGN KEY (`project_id`) REFERENCES `career_projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `career_project_skills_skill_idx` ON `career_project_skills` (`skill_id`);
--> statement-breakpoint
CREATE TABLE `career_publication_projects` (
  `publication_id` integer NOT NULL,
  `project_id` integer NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`publication_id`, `project_id`),
  FOREIGN KEY (`publication_id`) REFERENCES `career_publications`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `career_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `career_publication_projects_project_idx` ON `career_publication_projects` (`project_id`);
--> statement-breakpoint
CREATE TABLE `career_achievement_publications` (
  `achievement_id` integer NOT NULL,
  `publication_id` integer NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`achievement_id`, `publication_id`),
  FOREIGN KEY (`achievement_id`) REFERENCES `career_achievements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`publication_id`) REFERENCES `career_publications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `career_achievement_publications_publication_idx` ON `career_achievement_publications` (`publication_id`);
--> statement-breakpoint
CREATE TABLE `career_portfolio_topic_projects` (
  `topic_id` integer NOT NULL,
  `project_id` integer NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`topic_id`, `project_id`),
  FOREIGN KEY (`topic_id`) REFERENCES `career_portfolio_topics`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `career_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `career_portfolio_topic_projects_project_idx` ON `career_portfolio_topic_projects` (`project_id`);
--> statement-breakpoint
CREATE TABLE `career_achievement_directions` (
  `achievement_id` integer NOT NULL,
  `direction_key` text NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`achievement_id`, `direction_key`),
  FOREIGN KEY (`achievement_id`) REFERENCES `career_achievements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `career_achievement_directions_direction_idx` ON `career_achievement_directions` (`direction_key`);
--> statement-breakpoint
CREATE TABLE `career_project_directions` (
  `project_id` integer NOT NULL,
  `direction_key` text NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`project_id`, `direction_key`),
  FOREIGN KEY (`project_id`) REFERENCES `career_projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `career_project_directions_direction_idx` ON `career_project_directions` (`direction_key`);
--> statement-breakpoint
CREATE TABLE `career_story_directions` (
  `story_id` integer NOT NULL,
  `direction_key` text NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`story_id`, `direction_key`),
  FOREIGN KEY (`story_id`) REFERENCES `career_stories`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `career_story_directions_direction_idx` ON `career_story_directions` (`direction_key`);
--> statement-breakpoint
CREATE TABLE `career_publication_directions` (
  `publication_id` integer NOT NULL,
  `direction_key` text NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`publication_id`, `direction_key`),
  FOREIGN KEY (`publication_id`) REFERENCES `career_publications`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `career_publication_directions_direction_idx` ON `career_publication_directions` (`direction_key`);
--> statement-breakpoint
CREATE TABLE `career_portfolio_topic_directions` (
  `topic_id` integer NOT NULL,
  `direction_key` text NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`topic_id`, `direction_key`),
  FOREIGN KEY (`topic_id`) REFERENCES `career_portfolio_topics`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `career_portfolio_topic_directions_direction_idx` ON `career_portfolio_topic_directions` (`direction_key`);
--> statement-breakpoint
CREATE TABLE `job_requirement_skill_mentions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_requirement_id` integer NOT NULL,
  `raw_term` text NOT NULL,
  `normalized_term` text NOT NULL,
  `mapping_state` text NOT NULL DEFAULT 'pending',
  `resolved_skill_id` integer,
  `occurrences_json` text NOT NULL DEFAULT '[]',
  `revision` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`job_requirement_id`) REFERENCES `job_requirements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`resolved_skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `job_requirement_skill_mentions_state_check` CHECK(`mapping_state` in ('pending','mapped','skipped')),
  CONSTRAINT `job_requirement_skill_mentions_resolution_check` CHECK((`mapping_state` = 'mapped' and `resolved_skill_id` is not null) or (`mapping_state` != 'mapped' and `resolved_skill_id` is null)),
  CONSTRAINT `job_requirement_skill_mentions_term_check` CHECK(length(trim(`raw_term`)) > 0 and length(trim(`normalized_term`)) > 0),
  CONSTRAINT `job_requirement_skill_mentions_revision_check` CHECK(`revision` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_requirement_skill_mentions_requirement_term_unique_idx` ON `job_requirement_skill_mentions` (`job_requirement_id`, `normalized_term`);
--> statement-breakpoint
CREATE INDEX `job_requirement_skill_mentions_requirement_idx` ON `job_requirement_skill_mentions` (`job_requirement_id`);
--> statement-breakpoint
CREATE INDEX `job_requirement_skill_mentions_resolved_skill_idx` ON `job_requirement_skill_mentions` (`resolved_skill_id`);
--> statement-breakpoint
CREATE INDEX `job_requirement_skill_mentions_state_idx` ON `job_requirement_skill_mentions` (`mapping_state`);
--> statement-breakpoint
-- Career state bookkeeping row. Personal facts are not created here: an empty
-- database must onboard the user instead of inventing a candidate.
INSERT INTO `career_state` (`id`, `revision`, `content_hash`, `created_at`, `updated_at`)
VALUES (1, 0, '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
--> statement-breakpoint
-- Backfill requirement-owned mentions from the existing requirement/skill
-- junction so historical mappings and their provenance survive. `raw_label` is
-- used when present, otherwise the catalog name. Legacy rows carry no recorded
-- source text, so their provenance is labelled `legacy-unknown` rather than
-- guessed. When one requirement has several junction rows with the same
-- normalized term, the ambiguity becomes one pending mention that lists the
-- competing catalog entries: it is never resolved arbitrarily.
WITH `legacy_terms` AS (
  SELECT
    `jrs`.`job_requirement_id` AS `requirement_id`,
    `jrs`.`skill_id` AS `skill_id`,
    COALESCE(NULLIF(trim(`jrs`.`raw_label`), ''), `s`.`name`) AS `term`,
    lower(trim(COALESCE(NULLIF(trim(`jrs`.`raw_label`), ''), `s`.`name`))) AS `normalized_term`,
    `jrs`.`confidence` AS `confidence`
  FROM `job_requirements_to_skills` AS `jrs`
  INNER JOIN `skills` AS `s` ON `s`.`id` = `jrs`.`skill_id`
),
`grouped_terms` AS (
  SELECT `requirement_id`, `normalized_term`, count(*) AS `matches`
  FROM `legacy_terms`
  GROUP BY `requirement_id`, `normalized_term`
)
INSERT INTO `job_requirement_skill_mentions` (
  `job_requirement_id`, `raw_term`, `normalized_term`, `mapping_state`, `resolved_skill_id`,
  `occurrences_json`, `revision`, `created_at`, `updated_at`
)
SELECT
  `lt`.`requirement_id`,
  min(`lt`.`term`),
  `lt`.`normalized_term`,
  'pending',
  NULL,
  json_object(
    'source', 'legacy-junction',
    'provenance', 'legacy-unknown',
    'conflict', json_group_array(json_object('skillId', `lt`.`skill_id`, 'confidence', `lt`.`confidence`))
  ),
  1,
  `jr`.`created_at`,
  `jr`.`updated_at`
FROM `legacy_terms` AS `lt`
INNER JOIN `grouped_terms` AS `g`
  ON `g`.`requirement_id` = `lt`.`requirement_id` AND `g`.`normalized_term` = `lt`.`normalized_term`
INNER JOIN `job_requirements` AS `jr` ON `jr`.`id` = `lt`.`requirement_id`
WHERE `g`.`matches` > 1
GROUP BY `lt`.`requirement_id`, `lt`.`normalized_term`;
--> statement-breakpoint
WITH `legacy_terms` AS (
  SELECT
    `jrs`.`job_requirement_id` AS `requirement_id`,
    `jrs`.`skill_id` AS `skill_id`,
    COALESCE(NULLIF(trim(`jrs`.`raw_label`), ''), `s`.`name`) AS `term`,
    lower(trim(COALESCE(NULLIF(trim(`jrs`.`raw_label`), ''), `s`.`name`))) AS `normalized_term`,
    `jrs`.`confidence` AS `confidence`
  FROM `job_requirements_to_skills` AS `jrs`
  INNER JOIN `skills` AS `s` ON `s`.`id` = `jrs`.`skill_id`
),
`grouped_terms` AS (
  SELECT `requirement_id`, `normalized_term`, count(*) AS `matches`
  FROM `legacy_terms`
  GROUP BY `requirement_id`, `normalized_term`
)
INSERT INTO `job_requirement_skill_mentions` (
  `job_requirement_id`, `raw_term`, `normalized_term`, `mapping_state`, `resolved_skill_id`,
  `occurrences_json`, `revision`, `created_at`, `updated_at`
)
SELECT
  `lt`.`requirement_id`,
  `lt`.`term`,
  `lt`.`normalized_term`,
  'mapped',
  `lt`.`skill_id`,
  json_object(
    'source', 'legacy-junction',
    'provenance', 'legacy-unknown',
    'confidence', `lt`.`confidence`
  ),
  1,
  `jr`.`created_at`,
  `jr`.`updated_at`
FROM `legacy_terms` AS `lt`
INNER JOIN `grouped_terms` AS `g`
  ON `g`.`requirement_id` = `lt`.`requirement_id` AND `g`.`normalized_term` = `lt`.`normalized_term`
INNER JOIN `job_requirements` AS `jr` ON `jr`.`id` = `lt`.`requirement_id`
WHERE `g`.`matches` = 1;
