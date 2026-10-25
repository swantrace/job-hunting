CREATE TABLE analysis_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_key TEXT NOT NULL,
  execution_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Queued',
  job_application_id INTEGER REFERENCES job_applications(id) ON DELETE SET NULL,
  job_posting_id INTEGER REFERENCES job_postings(id) ON DELETE SET NULL,
  job_analysis_run_id INTEGER REFERENCES job_posting_analyses(id) ON DELETE SET NULL,
  candidate_analysis_run_id INTEGER REFERENCES application_analysis_runs(id) ON DELETE SET NULL,
  batch_item_id INTEGER REFERENCES batch_analysis_items(id) ON DELETE CASCADE,
  intake_item_id INTEGER REFERENCES job_intake_items(id) ON DELETE CASCADE,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT analysis_workflows_mode_check CHECK (mode IN ('job-and-candidate', 'candidate-only')),
  CONSTRAINT analysis_workflows_status_check CHECK (status IN ('Queued', 'Processing', 'Completed', 'Failed'))
);
--> statement-breakpoint
CREATE INDEX analysis_workflows_status_idx ON analysis_workflows(status);
--> statement-breakpoint
CREATE UNIQUE INDEX analysis_workflows_source_key_unique ON analysis_workflows(source_key);
--> statement-breakpoint
CREATE UNIQUE INDEX analysis_workflows_execution_id_unique ON analysis_workflows(execution_id);
