ALTER TABLE `job_posting_analyses` ADD `summary` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `role_type` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `advertised_seniority` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `practical_seniority` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `classification_rationale` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `functional_emphasis_json` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `interview_questions_json` text;
--> statement-breakpoint
ALTER TABLE `job_posting_analyses` ADD `schema_version` text;
--> statement-breakpoint
CREATE TABLE `job_requirements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `job_posting_analysis_id` integer NOT NULL,
  `sequence` integer NOT NULL,
  `requirement_type` text NOT NULL,
  `importance` text NOT NULL,
  `basis` text NOT NULL,
  `statement` text NOT NULL,
  `source_text` text,
  `inference_rationale` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`job_posting_analysis_id`) REFERENCES `job_posting_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `job_requirements_analysis_sequence_unique_idx` UNIQUE(`job_posting_analysis_id`, `sequence`),
  CONSTRAINT `job_requirements_type_check` CHECK(`requirement_type` in ('skill','experience','responsibility','education','soft-skill','domain')),
  CONSTRAINT `job_requirements_importance_check` CHECK(`importance` in ('required','preferred','mentioned')),
  CONSTRAINT `job_requirements_basis_check` CHECK(`basis` in ('explicit','inferred','legacy')),
  CONSTRAINT `job_requirements_inferred_rationale_check` CHECK(`basis` != 'inferred' or (`inference_rationale` is not null and trim(`inference_rationale`) != '')),
  CONSTRAINT `job_requirements_source_text_check` CHECK(`basis` = 'legacy' or (`source_text` is not null and trim(`source_text`) != ''))
);
--> statement-breakpoint
CREATE INDEX `job_requirements_analysis_idx` ON `job_requirements` (`job_posting_analysis_id`);
--> statement-breakpoint
CREATE INDEX `job_requirements_type_idx` ON `job_requirements` (`requirement_type`);
--> statement-breakpoint
CREATE INDEX `job_requirements_importance_idx` ON `job_requirements` (`importance`);
--> statement-breakpoint
CREATE TABLE `job_requirements_to_skills` (
  `job_requirement_id` integer NOT NULL,
  `skill_id` integer NOT NULL,
  PRIMARY KEY(`job_requirement_id`, `skill_id`),
  FOREIGN KEY (`job_requirement_id`) REFERENCES `job_requirements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Backfill legacy line-based requirements into ordered `legacy` rows without
-- inventing source excerpts. Existing analyses keep their original columns.
WITH RECURSIVE `split` (`analysis_id`, `line`, `remainder`, `seq`) AS (
  SELECT
    `id`,
    NULL,
    `requirements` || char(10),
    0
  FROM `job_posting_analyses`
  WHERE `requirements` IS NOT NULL AND trim(`requirements`) != ''
  UNION ALL
  SELECT
    `analysis_id`,
    substr(`remainder`, 1, instr(`remainder`, char(10)) - 1),
    substr(`remainder`, instr(`remainder`, char(10)) + 1),
    `seq` + 1
  FROM `split`
  WHERE instr(`remainder`, char(10)) > 0
)
INSERT INTO `job_requirements` (
  `job_posting_analysis_id`,
  `sequence`,
  `requirement_type`,
  `importance`,
  `basis`,
  `statement`,
  `source_text`,
  `inference_rationale`,
  `created_at`,
  `updated_at`
)
SELECT
  `analysis_id`,
  `seq`,
  'experience',
  'mentioned',
  'legacy',
  trim(`line`),
  NULL,
  NULL,
  date('now'),
  date('now')
FROM `split`
WHERE `seq` > 0 AND trim(`line`) != '';
