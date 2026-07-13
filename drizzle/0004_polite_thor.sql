CREATE TABLE `job_postings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_application_id` integer NOT NULL,
	`raw_text` text NOT NULL,
	`captured_at` text NOT NULL,
	`content_hash` text NOT NULL,
	`parsed_at` text,
	`parser_model` text,
	`parser_prompt_version` text,
	FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_postings_application_unique_idx` ON `job_postings` (`job_application_id`);--> statement-breakpoint
CREATE INDEX `job_postings_content_hash_idx` ON `job_postings` (`content_hash`);