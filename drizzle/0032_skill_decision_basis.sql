-- Preserve decisions and their self-references while replacing the old reason CHECK.
CREATE TEMP TABLE decision_backup AS SELECT * FROM analysis_run_decisions;
--> statement-breakpoint
DROP TABLE analysis_run_decisions;
--> statement-breakpoint
CREATE TABLE analysis_run_decisions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  application_analysis_run_id integer NOT NULL REFERENCES application_analysis_runs(id) ON DELETE CASCADE,
  skill_id integer NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  decision text NOT NULL DEFAULT 'pending',
  reason text,
  previous_decision_id integer REFERENCES analysis_run_decisions(id) ON DELETE SET NULL,
  include_basis text NOT NULL DEFAULT 'user-reason',
  basis_hash text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  CONSTRAINT analysis_run_decisions_decision_check CHECK (decision IN ('pending','skip','include')),
  CONSTRAINT analysis_run_decisions_include_reason_check CHECK (decision != 'include' OR include_basis = 'transferable' OR (reason IS NOT NULL AND trim(reason) != '')),
  CONSTRAINT analysis_run_decisions_basis_check CHECK (include_basis IN ('user-reason','transferable'))
);
--> statement-breakpoint
INSERT INTO analysis_run_decisions (id, application_analysis_run_id, skill_id, decision, reason, previous_decision_id, created_at, updated_at)
SELECT id, application_analysis_run_id, skill_id, decision, reason, previous_decision_id, created_at, updated_at FROM decision_backup ORDER BY id;
--> statement-breakpoint
DROP TABLE decision_backup;
--> statement-breakpoint
CREATE UNIQUE INDEX analysis_run_decisions_run_skill_unique_idx ON analysis_run_decisions(application_analysis_run_id,skill_id);
