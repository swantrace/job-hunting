CREATE TABLE `generation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_application_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `generation_runs_status_check` CHECK(`status` in ('Queued', 'Processing', 'Completed', 'Failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_runs_queue_job_unique_idx` ON `generation_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `generation_runs_application_created_idx` ON `generation_runs` (`job_application_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `generation_runs_status_idx` ON `generation_runs` (`status`);
--> statement-breakpoint
CREATE TABLE `generated_artifacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `generation_run_id` integer NOT NULL,
  `type` text NOT NULL,
  `file_name` text NOT NULL,
  `file_path` text NOT NULL,
  `mime_type` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `generated_artifacts_type_check` CHECK(`type` in ('job_context', 'resume', 'cover_letter'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generated_artifacts_run_type_unique_idx` ON `generated_artifacts` (`generation_run_id`,`type`);
