ALTER TABLE `job_posting_analyses` ADD `status` text NOT NULL DEFAULT 'Completed';
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `queue_job_id` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `attempts` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `input_hash` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `frozen_input_json` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `error_message` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `created_at` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `updated_at` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `started_at` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `completed_at` text;
--> statement-breakpoint
DROP INDEX `job_posting_analyses_posting_unique_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `job_posting_analyses_queue_job_unique_idx` ON `job_posting_analyses` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `job_posting_analyses_posting_id_idx` ON `job_posting_analyses` (`job_posting_id`, `id`);
--> statement-breakpoint
CREATE INDEX `job_posting_analyses_status_idx` ON `job_posting_analyses` (`status`);
--> statement-breakpoint
-- Backfill pre-run rows: they already hold completed results, so they become
-- Completed without running an LLM. Their creation/update dates are unknown;
-- generated_at is the closest preserved timestamp. Null-schema rows remain
-- legacy because staleness/legacy is derived from schema_version/input_hash,
-- never from a persisted status.
UPDATE `job_posting_analyses`
SET `status` = 'Completed',
    `created_at` = `generated_at`,
    `updated_at` = `generated_at`,
    `completed_at` = `generated_at`
WHERE `created_at` = '';
