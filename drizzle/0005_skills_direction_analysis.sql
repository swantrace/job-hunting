ALTER TABLE `tags` RENAME TO `skills`;
--> statement-breakpoint
DROP INDEX `tags_name_nocase_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_nocase_idx` ON `skills` (`name` COLLATE NOCASE);
--> statement-breakpoint
ALTER TABLE `job_applications_to_tags` RENAME TO `job_applications_to_skills`;
--> statement-breakpoint
ALTER TABLE `job_applications_to_skills` RENAME COLUMN `tag_id` TO `skill_id`;
--> statement-breakpoint
ALTER TABLE `job_applications` ADD `direction` text NOT NULL DEFAULT 'fullstack';
--> statement-breakpoint
CREATE TABLE `job_posting_analyses` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_posting_id` integer NOT NULL,
  `requirements` text,
  `responsibilities` text,
  `pain_points` text,
  `culture` text,
  `red_flags` text,
  `success_metrics` text,
  `benefits` text,
  `notes` text,
  `generated_at` text NOT NULL,
  `model` text,
  `prompt_version` text,
  FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_posting_analyses_posting_unique_idx` ON `job_posting_analyses` (`job_posting_id`);
--> statement-breakpoint
CREATE INDEX `job_posting_analyses_generated_idx` ON `job_posting_analyses` (`generated_at`);
