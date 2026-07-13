CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_unique` ON `companies` (`name`);--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_application_id` integer NOT NULL,
	`action_date` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follow_ups_job_date_idx` ON `follow_ups` (`job_application_id`,`action_date`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_application_id` integer NOT NULL,
	`interview_date` text NOT NULL,
	`round_name` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interviews_job_date_idx` ON `interviews` (`job_application_id`,`interview_date`);--> statement-breakpoint
CREATE TABLE `job_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`job_title` text NOT NULL,
	`location` text,
	`url` text,
	`posted_date` text NOT NULL,
	`priority` text DEFAULT 'B' NOT NULL,
	`applied_date` text,
	`resume_version` text,
	`match_level` text,
	`application_source` text,
	`salary` text,
	`contact` text,
	`notes` text,
	`status` text DEFAULT 'Saved' NOT NULL,
	`status_before_archive` text,
	`apply_today_target_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "priority_check" CHECK("job_applications"."priority" in ('A', 'B', 'C')),
	CONSTRAINT "match_level_check" CHECK("job_applications"."match_level" is null or "job_applications"."match_level" in ('A', 'B')),
	CONSTRAINT "status_check" CHECK("job_applications"."status" in ('Saved', 'Apply Today', 'Applied', 'Follow Up', 'Interviewing', 'Rejected', 'Archived'))
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `job_applications` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_priority_idx` ON `job_applications` (`priority`);--> statement-breakpoint
CREATE INDEX `jobs_company_idx` ON `job_applications` (`company_id`);--> statement-breakpoint
CREATE INDEX `jobs_posted_date_idx` ON `job_applications` (`posted_date`);--> statement-breakpoint
CREATE INDEX `jobs_applied_date_idx` ON `job_applications` (`applied_date`);--> statement-breakpoint
CREATE INDEX `jobs_target_date_idx` ON `job_applications` (`apply_today_target_date`);--> statement-breakpoint
CREATE INDEX `jobs_status_updated_idx` ON `job_applications` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `job_applications_to_tags` (
	`job_application_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`job_application_id`, `tag_id`),
	FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);