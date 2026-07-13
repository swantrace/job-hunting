DROP INDEX `companies_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_nocase_idx` ON `companies` (lower("name"));--> statement-breakpoint
DROP INDEX `tags_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_nocase_idx` ON `tags` (lower("name"));