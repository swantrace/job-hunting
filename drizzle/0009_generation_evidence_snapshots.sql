CREATE TABLE `generation_evidence_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `generation_run_id` integer NOT NULL,
  `snapshot_json` text NOT NULL,
  `file_path` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`generation_run_id`) REFERENCES `generation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_evidence_snapshots_run_unique_idx` ON `generation_evidence_snapshots` (`generation_run_id`);
