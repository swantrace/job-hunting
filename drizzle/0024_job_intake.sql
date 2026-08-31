-- Safe batch Job Post intake. Items preserve input order and retain their
-- original URL/text, extracted/pasted raw text, per-item state, attempts, error,
-- and an optional reference to the created application/job posting.
CREATE TABLE `job_intake_batches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_intake_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `batch_id` integer NOT NULL,
  `sequence` integer NOT NULL,
  `kind` text NOT NULL,
  `raw` text NOT NULL,
  `normalized_url` text,
  `extracted_text` text,
  `status` text NOT NULL DEFAULT 'pending',
  `attempts` integer NOT NULL DEFAULT 0,
  `error_message` text,
  `job_application_id` integer,
  `job_posting_id` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`batch_id`) REFERENCES `job_intake_batches`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`job_application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_intake_items_batch_sequence_unique_idx` ON `job_intake_items` (`batch_id`, `sequence`);
--> statement-breakpoint
CREATE INDEX `job_intake_items_batch_idx` ON `job_intake_items` (`batch_id`);
--> statement-breakpoint
CREATE INDEX `job_intake_items_status_idx` ON `job_intake_items` (`status`);
