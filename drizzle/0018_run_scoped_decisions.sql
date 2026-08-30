CREATE TABLE `analysis_run_decisions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `application_analysis_run_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  `decision` text NOT NULL DEFAULT 'pending',
  `reason` text,
  `previous_decision_id` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`application_analysis_run_id`) REFERENCES `application_analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`previous_decision_id`) REFERENCES `analysis_run_decisions`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `analysis_run_decisions_decision_check` CHECK(`decision` in ('pending','skip','include')),
  CONSTRAINT `analysis_run_decisions_include_reason_check` CHECK(`decision` != 'include' or (`reason` is not null and trim(`reason`) != ''))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_run_decisions_run_skill_unique_idx` ON `analysis_run_decisions` (`application_analysis_run_id`, `skill_id`);
--> statement-breakpoint
CREATE INDEX `analysis_run_decisions_run_idx` ON `analysis_run_decisions` (`application_analysis_run_id`);
--> statement-breakpoint
-- Backfill only unambiguous legacy decisions (skip, or include with a reason)
-- to the latest applicable completed Candidate run. Pending and include-without-
-- a-reason rows stay unapproved; they are never silently accepted.
INSERT INTO `analysis_run_decisions` (
  `application_analysis_run_id`, `skill_id`, `decision`, `reason`, `created_at`, `updated_at`
)
SELECT
  (
    SELECT `id` FROM `application_analysis_runs`
    WHERE `job_application_id` = `relation`.`job_application_id` AND `status` = 'Completed'
    ORDER BY `id` DESC
    LIMIT 1
  ),
  `relation`.`skill_id`,
  `relation`.`user_decision`,
  CASE WHEN `relation`.`user_decision` = 'include' THEN `relation`.`decision_reason` ELSE NULL END,
  `relation`.`updated_at`,
  `relation`.`updated_at`
FROM `job_applications_to_skills` AS `relation`
WHERE `relation`.`user_decision` IN ('skip', 'include')
  AND EXISTS (
    SELECT 1 FROM `application_analysis_runs`
    WHERE `job_application_id` = `relation`.`job_application_id` AND `status` = 'Completed'
  );
