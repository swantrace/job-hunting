-- Remove the unused portfolio-topic feature (39 -> 37 physical tables).
--
-- The owner confirmed the feature is not wanted. It was an editorial planning
-- list that never fed any prompt or document (portfolio-only edits were
-- deliberately excluded from document freshness), and it holds no rows in this
-- database: career_portfolio_topics = 0 and career_portfolio_topic_projects = 0,
-- with `topics: []` in career-data/portfolio-content.json.
--
-- Every career fact is preserved: the 104 direction links in
-- career_record_directions are carried over. `topic_id` cannot be dropped in
-- place because it appears in the exactly-one CHECK constraint, so that table is
-- rebuilt without it. The raw portfolio-content.json document itself stays
-- preserved inside career_state.legacy_documents_json; only the structured
-- editing/import/export path goes away.

-- 1. Rebuild the direction junction without the topic column.
CREATE TABLE `career_record_directions_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `direction_key` text NOT NULL,
  `achievement_id` integer,
  `project_id` integer,
  `story_id` integer,
  `publication_id` integer,
  `position` integer NOT NULL DEFAULT 0,
  FOREIGN KEY (`direction_key`) REFERENCES `career_directions`(`key`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`achievement_id`) REFERENCES `career_achievements`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `career_projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`story_id`) REFERENCES `career_stories`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`publication_id`) REFERENCES `career_publications`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `career_record_directions_exactly_one_check` CHECK((`achievement_id` is not null) + (`project_id` is not null) + (`story_id` is not null) + (`publication_id` is not null) = 1)
);
--> statement-breakpoint
INSERT INTO `career_record_directions_new` (`id`, `direction_key`, `achievement_id`, `project_id`, `story_id`, `publication_id`, `position`)
SELECT `id`, `direction_key`, `achievement_id`, `project_id`, `story_id`, `publication_id`, `position`
FROM `career_record_directions`
WHERE `topic_id` IS NULL;
--> statement-breakpoint
DROP TABLE `career_record_directions`;
--> statement-breakpoint
ALTER TABLE `career_record_directions_new` RENAME TO `career_record_directions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_achievement_unique_idx` ON `career_record_directions` (`achievement_id`, `direction_key`) WHERE `achievement_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_project_unique_idx` ON `career_record_directions` (`project_id`, `direction_key`) WHERE `project_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_story_unique_idx` ON `career_record_directions` (`story_id`, `direction_key`) WHERE `story_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `career_record_directions_publication_unique_idx` ON `career_record_directions` (`publication_id`, `direction_key`) WHERE `publication_id` IS NOT NULL;
--> statement-breakpoint
-- 2. Drop the portfolio tables themselves (the project links first, because they
--    reference the topics table).
DROP TABLE `career_portfolio_topic_projects`;
--> statement-breakpoint
DROP TABLE `career_portfolio_topics`;
