-- Skill identity is now the immutable `skills.key`. Existing taxonomy and AI
-- derivations are intentionally disposable; applications and raw job postings
-- remain so they can be analyzed again against the canonical career data.
DELETE FROM `job_posting_analyses`;
--> statement-breakpoint
DELETE FROM `skill_aliases`;
--> statement-breakpoint
DELETE FROM `skills` WHERE `review_status` = 'merged';
--> statement-breakpoint
DELETE FROM `skills`;
--> statement-breakpoint
DROP INDEX `skills_career_skill_id_unique_idx`;
--> statement-breakpoint
ALTER TABLE `skills` DROP COLUMN `career_skill_id`;
