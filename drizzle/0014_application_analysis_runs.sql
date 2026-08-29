CREATE TABLE `application_analysis_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_application_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `input_hash` text,
  `input_snapshot_json` text,
  `result_json` text,
  `model` text,
  `prompt_version` text,
  `schema_version` text,
  `error_message` text,
  `recommended_profile_id` text,
  `confirmed_profile_id` text,
  `profile_confirmed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `application_analysis_runs_status_check` CHECK(`status` in ('Queued','Processing','Completed','Failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_analysis_runs_queue_job_unique_idx` ON `application_analysis_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `application_analysis_runs_application_created_idx` ON `application_analysis_runs` (`job_application_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `application_analysis_runs_status_idx` ON `application_analysis_runs` (`status`);
