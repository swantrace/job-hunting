CREATE TABLE `baseline_generation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `direction` text NOT NULL,
  `target_title` text NOT NULL,
  `target_keywords` text NOT NULL DEFAULT '[]',
  `status` text NOT NULL DEFAULT 'Queued',
  `queue_job_id` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  CONSTRAINT `baseline_generation_runs_status_check` CHECK(`status` in ('Queued', 'Processing', 'Completed', 'Failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_generation_runs_queue_job_unique_idx` ON `baseline_generation_runs` (`queue_job_id`);
--> statement-breakpoint
CREATE INDEX `baseline_generation_runs_direction_created_idx` ON `baseline_generation_runs` (`direction`,`created_at`);
--> statement-breakpoint
CREATE INDEX `baseline_generation_runs_status_idx` ON `baseline_generation_runs` (`status`);
--> statement-breakpoint
CREATE TABLE `baseline_generated_artifacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `baseline_generation_run_id` integer NOT NULL,
  `type` text NOT NULL,
  `file_name` text NOT NULL,
  `file_path` text NOT NULL,
  `mime_type` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`baseline_generation_run_id`) REFERENCES `baseline_generation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `baseline_generated_artifacts_type_check` CHECK(`type` = 'resume')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_generated_artifacts_run_type_unique_idx` ON `baseline_generated_artifacts` (`baseline_generation_run_id`,`type`);
--> statement-breakpoint
CREATE TABLE `baseline_generation_evidence_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `baseline_generation_run_id` integer NOT NULL,
  `snapshot_json` text NOT NULL,
  `file_path` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`baseline_generation_run_id`) REFERENCES `baseline_generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_generation_evidence_snapshots_run_unique_idx` ON `baseline_generation_evidence_snapshots` (`baseline_generation_run_id`);
