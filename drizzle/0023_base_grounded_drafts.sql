-- Base-grounded drafts: store the reviewed Markdown draft, its deterministic
-- validation JSON, and the DOCX renderer version alongside the legacy structured
-- result fields. Legacy JSON fields are retained unchanged so historical
-- template-generated artifacts stay readable.
ALTER TABLE `generation_run_results` ADD COLUMN `resume_markdown` text;
--> statement-breakpoint
ALTER TABLE `generation_run_results` ADD COLUMN `cover_letter_markdown` text;
--> statement-breakpoint
ALTER TABLE `generation_run_results` ADD COLUMN `draft_validation_json` text;
--> statement-breakpoint
ALTER TABLE `generation_run_results` ADD COLUMN `renderer_version` text;
--> statement-breakpoint
CREATE TABLE `baseline_generation_results` (
  `baseline_generation_run_id` integer PRIMARY KEY NOT NULL,
  `resume_markdown` text,
  `draft_validation_json` text,
  `renderer_version` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`baseline_generation_run_id`) REFERENCES `baseline_generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
