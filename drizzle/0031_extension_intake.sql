-- Nullable business date without rebuilding the parent table or cascading children.
DROP INDEX jobs_posted_date_idx;
--> statement-breakpoint
ALTER TABLE job_applications ADD COLUMN posted_date_new text;
--> statement-breakpoint
UPDATE job_applications SET posted_date_new = posted_date;
--> statement-breakpoint
ALTER TABLE job_applications DROP COLUMN posted_date;
--> statement-breakpoint
ALTER TABLE job_applications RENAME COLUMN posted_date_new TO posted_date;
--> statement-breakpoint
CREATE INDEX jobs_posted_date_idx ON job_applications(posted_date);
--> statement-breakpoint
ALTER TABLE job_applications ADD COLUMN field_provenance_json text;
--> statement-breakpoint
ALTER TABLE job_intake_batches ADD COLUMN client_batch_id text;
--> statement-breakpoint
ALTER TABLE job_intake_batches ADD COLUMN idempotency_key text;
--> statement-breakpoint
ALTER TABLE job_intake_batches ADD COLUMN request_hash text;
--> statement-breakpoint
ALTER TABLE job_intake_batches ADD COLUMN terminal_revision text;
--> statement-breakpoint
ALTER TABLE job_intake_batches ADD COLUMN revision integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE UNIQUE INDEX intake_batch_client_unique ON job_intake_batches(client_batch_id);
--> statement-breakpoint
CREATE UNIQUE INDEX intake_batch_idempotency_unique ON job_intake_batches(idempotency_key);
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN client_item_id text;
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN payload_json text;
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN pipeline_status text CHECK(pipeline_status IS NULL OR pipeline_status IN ('accepted','queued','processing','completed','duplicate','failed','rejected'));
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN stage text NOT NULL DEFAULT 'intake';
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN error_code text;
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN field_errors_json text;
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN job_analysis_run_id integer REFERENCES job_posting_analyses(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN candidate_analysis_run_id integer REFERENCES application_analysis_runs(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN claimed_at integer;
--> statement-breakpoint
ALTER TABLE job_intake_items ADD COLUMN next_dispatch_at integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX intake_pipeline_dispatch_idx ON job_intake_items(pipeline_status, next_dispatch_at);
--> statement-breakpoint
CREATE TABLE job_source_identities (
  identity text PRIMARY KEY NOT NULL,
  job_application_id integer NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX job_source_identity_application_idx ON job_source_identities(job_application_id);
--> statement-breakpoint
-- Original URLs are safe aliases. Existing duplicate applications remain untouched.
INSERT OR IGNORE INTO job_source_identities(identity, job_application_id)
SELECT 'url:' || url, min(id) FROM job_applications WHERE url IS NOT NULL AND trim(url) != '' GROUP BY url;
