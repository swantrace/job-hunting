CREATE TABLE `generation_run_results` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `generation_run_id` integer NOT NULL,
  `resume_json` text,
  `cover_letter_json` text,
  `ats_audit_json` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_run_results_run_unique_idx` ON `generation_run_results` (`generation_run_id`);
