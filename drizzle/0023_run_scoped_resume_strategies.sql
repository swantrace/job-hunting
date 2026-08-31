-- Run-scoped resume strategy. One user-confirmed, deterministic strategy per
-- completed candidate analysis run; stored as validated JSON text columns with
-- SQLite JSON checks and a unique run FK. Existing runs, decisions, and
-- generation snapshots are untouched.
CREATE TABLE `analysis_run_resume_strategies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `application_analysis_run_id` integer NOT NULL,
  `positioning` text NOT NULL,
  `primary_themes` text NOT NULL,
  `emphasize_evidence_ids` text NOT NULL,
  `deemphasize_evidence_ids` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`application_analysis_run_id`) REFERENCES `application_analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `analysis_run_resume_strategies_positioning_check` CHECK(trim(`positioning`) != ''),
  CONSTRAINT `analysis_run_resume_strategies_primary_themes_json_check` CHECK(json_valid(`primary_themes`)),
  CONSTRAINT `analysis_run_resume_strategies_emphasize_json_check` CHECK(json_valid(`emphasize_evidence_ids`)),
  CONSTRAINT `analysis_run_resume_strategies_deemphasize_json_check` CHECK(json_valid(`deemphasize_evidence_ids`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_resume_strategies_run_unique_idx` ON `analysis_run_resume_strategies` (`application_analysis_run_id`);
