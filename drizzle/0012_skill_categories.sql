CREATE TABLE `skill_categories` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `key` text NOT NULL,
  `label` text NOT NULL,
  `sort_order` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `skill_categories` (`key`, `label`, `sort_order`, `created_at`, `updated_at`) VALUES
  ('languages-web', 'Languages & Web Fundamentals', 10, date('now'), date('now')),
  ('frontend', 'Frontend', 20, date('now'), date('now')),
  ('backend-apis', 'Backend & APIs', 30, date('now'), date('now')),
  ('databases-caching', 'Databases & Caching', 40, date('now'), date('now')),
  ('messaging-async', 'Messaging & Async Processing', 50, date('now'), date('now')),
  ('cloud-devops', 'Cloud & DevOps', 60, date('now'), date('now')),
  ('testing-quality', 'Testing & Quality', 70, date('now'), date('now')),
  ('security-identity', 'Security & Identity', 80, date('now'), date('now')),
  ('ai-ml', 'AI & ML', 90, date('now'), date('now')),
  ('architecture-practices', 'Architecture & Engineering Practices', 100, date('now'), date('now')),
  ('domain-platforms', 'Domain & Platforms', 110, date('now'), date('now'));
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_categories_key_unique_idx` ON `skill_categories` (`key`);
--> statement-breakpoint
ALTER TABLE `skills` RENAME TO `skills_legacy_taxonomy`;
--> statement-breakpoint
ALTER TABLE `job_applications_to_skills` RENAME TO `job_applications_to_skills_legacy_taxonomy`;
--> statement-breakpoint
ALTER TABLE `skill_aliases` RENAME TO `skill_aliases_legacy_taxonomy`;
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
  FOREIGN KEY (`merged_into_skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `skills_review_status_check` CHECK(`review_status` in ('pending','approved','rejected','merged')),
  CONSTRAINT `skills_origin_check` CHECK(`origin` in ('career-data','job-parser','manual','import')),
  CONSTRAINT `skills_merged_check` CHECK((`review_status` = 'merged' and `merged_into_skill_id` is not null) or (`review_status` != 'merged' and `merged_into_skill_id` is null))
);
--> statement-breakpoint
CREATE TABLE `job_applications_to_skills` (
  `job_application_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  `raw_label` text,
  `source_text` text,
  `importance` text NOT NULL DEFAULT 'mentioned',
  `parser_confidence` real,
  `analysis_result` text NOT NULL DEFAULT 'not-in-career-data',
  `user_decision` text NOT NULL DEFAULT 'pending',
  `decision_reason` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`job_application_id`, `skill_id`),
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `job_applications_to_skills_importance_check` CHECK(`importance` in ('required','preferred','mentioned')),
  CONSTRAINT `job_applications_to_skills_analysis_check` CHECK(`analysis_result` in ('proven-match','not-in-career-data')),
  CONSTRAINT `job_applications_to_skills_decision_check` CHECK(`user_decision` in ('pending','skip','include')),
  CONSTRAINT `job_applications_to_skills_include_reason_check` CHECK(`user_decision` != 'include' or (`decision_reason` is not null and trim(`decision_reason`) != ''))
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
INSERT INTO `skills` (
  `id`, `key`, `name`, `category`, `review_status`, `origin`, `career_skill_id`, `merged_into_skill_id`, `created_at`, `updated_at`
)
SELECT
  `id`, `key`, `name`, `category`, `review_status`, `origin`, `career_skill_id`, `merged_into_skill_id`, `created_at`, `updated_at`
FROM `skills_legacy_taxonomy`;
--> statement-breakpoint
INSERT INTO `job_applications_to_skills` (
  `job_application_id`, `skill_id`, `raw_label`, `source_text`, `importance`, `parser_confidence`, `analysis_result`, `user_decision`, `decision_reason`, `created_at`, `updated_at`
)
SELECT
  `job_application_id`, `skill_id`, `raw_label`, `source_text`, `importance`, `parser_confidence`, `analysis_result`, `user_decision`, `decision_reason`, `created_at`, `updated_at`
FROM `job_applications_to_skills_legacy_taxonomy`;
--> statement-breakpoint
INSERT INTO `skill_aliases` (`id`, `skill_id`, `alias`, `normalized_alias`, `origin`, `created_at`)
SELECT `id`, `skill_id`, `alias`, `normalized_alias`, `origin`, `created_at`
FROM `skill_aliases_legacy_taxonomy`;
--> statement-breakpoint
DROP TABLE `job_applications_to_skills_legacy_taxonomy`;
--> statement-breakpoint
DROP TABLE `skill_aliases_legacy_taxonomy`;
--> statement-breakpoint
DROP TABLE `skills_legacy_taxonomy`;
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
