CREATE TABLE `batch_analysis_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `batch_id` text NOT NULL,
  `job_application_id` integer REFERENCES `job_applications`(`id`) ON DELETE SET NULL,
  `job_posting_id` integer REFERENCES `job_postings`(`id`) ON DELETE SET NULL,
  `label` text NOT NULL,
  `mode` text NOT NULL CHECK (`mode` IN ('job-and-candidate', 'candidate-only')),
  `status` text NOT NULL DEFAULT 'queued' CHECK (`status` IN ('queued', 'job-analysis', 'candidate-analysis', 'completed', 'failed', 'skipped')),
  `job_analysis_run_id` integer REFERENCES `job_posting_analyses`(`id`) ON DELETE SET NULL,
  `candidate_analysis_run_id` integer REFERENCES `application_analysis_runs`(`id`) ON DELETE SET NULL,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `batch_analysis_items_batch_idx` ON `batch_analysis_items` (`batch_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `batch_analysis_items_active_application_idx`
ON `batch_analysis_items` (`job_application_id`)
WHERE `status` IN ('queued', 'job-analysis', 'candidate-analysis');
