ALTER TABLE `skills` RENAME TO `skills_legacy`;
--> statement-breakpoint
ALTER TABLE `job_applications_to_skills` RENAME TO `job_applications_to_skills_legacy`;
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
  FOREIGN KEY (`merged_into_skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `skills_review_status_check` CHECK(`review_status` in ('pending','approved','rejected','merged')),
  CONSTRAINT `skills_origin_check` CHECK(`origin` in ('career-data','job-parser','manual','import')),
  CONSTRAINT `skills_category_check` CHECK(`category` is null or `category` in ('languages-web','frontend','backend-apis','databases-caching','messaging-async','cloud-devops','testing-quality','security-identity','ai-ml','architecture-practices','domain-platforms')),
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
INSERT INTO `skills` (`id`, `key`, `name`, `category`, `review_status`, `origin`, `career_skill_id`, `merged_into_skill_id`, `created_at`, `updated_at`)
SELECT `id`, 'legacy-' || `id`, `name`, NULL, 'pending', 'manual', NULL, NULL, date('now'), date('now') FROM `skills_legacy`;
--> statement-breakpoint
INSERT INTO `job_applications_to_skills` (`job_application_id`, `skill_id`, `raw_label`, `importance`, `analysis_result`, `user_decision`, `created_at`, `updated_at`)
SELECT `j`.`job_application_id`, `j`.`skill_id`, `s`.`name`, 'mentioned', 'not-in-career-data', 'pending', date('now'), date('now')
FROM `job_applications_to_skills_legacy` AS `j`
INNER JOIN `skills_legacy` AS `s` ON `s`.`id` = `j`.`skill_id`;
--> statement-breakpoint
DROP TABLE `job_applications_to_skills_legacy`;
--> statement-breakpoint
DROP TABLE `skills_legacy`;
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
INSERT INTO `skill_aliases` (`skill_id`, `alias`, `normalized_alias`, `origin`, `created_at`)
SELECT `id`, `name`, lower(trim(`name`)), 'manual', date('now') FROM `skills`;
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
