CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`linkedin_url` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `contacts_company_idx` ON `contacts` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_company_email_nocase_idx` ON `contacts` (`company_id`,lower("email"));--> statement-breakpoint
CREATE TABLE `job_applications_to_contacts` (
	`job_application_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	PRIMARY KEY(`job_application_id`, `contact_id`),
	FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_applications_to_contacts_contact_idx` ON `job_applications_to_contacts` (`contact_id`);