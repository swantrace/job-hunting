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
CREATE UNIQUE INDEX `document_reviews_queue_job_unique_idx` ON `document_reviews` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `document_reviews_run_created_idx` ON `document_reviews` (`generation_run_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `document_reviews_status_idx` ON `document_reviews` (`status`);
