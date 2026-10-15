import { Database } from 'bun:sqlite'
import { sqlite } from './client'

const requiredTables = [
  'companies',
  'job_requirements_to_skills',
  'job_postings',
  'generation_runs',
  // Database-owned career facts and requirement-owned skill mentions
  // (migrations 0026 and 0027). A partially-applied migration must fail at boot.
  'career_profile',
  'career_state',
  'career_directions',
  'career_education',
  'career_experiences',
  'career_achievements',
  'career_projects',
  'career_stories',
  'career_publications',
  'career_skills',
  'career_base_resumes',
  'career_achievement_skills',
  'career_project_skills',
  'career_publication_projects',
  'career_achievement_publications',
  'career_record_directions',
  'job_requirement_skill_mentions',
]

// Columns added or folded in by later migrations. Checked here so a
// partially-applied or drift-out-of-sync migration fails fast at boot with a
// readable message instead of surfacing mid-request (e.g. during generation).
const requiredColumns: Record<string, string[]> = {
  generation_runs: [
    'kind',
    'baseline_json',
    'evidence_snapshot_json',
    'resume_json',
    'cover_letter_json',
    'ats_audit_json',
    'resume_markdown',
    'cover_letter_markdown',
    'draft_validation_json',
    'renderer_version',
  ],
}

function tableColumns(connection: Database, table: string): string[] {
  return connection
    .query(`PRAGMA table_info('${table}')`)
    .all()
    .map((row) => String((row as { name: string }).name))
}

/**
 * Startup schema readiness check. Fails with a readable message when the
 * canonical tables or migration-added columns are missing instead of surfacing
 * a cryptic "no such table"/"no such column" error later from a random route
 * query. Accepts an optional connection for isolated testing; production uses
 * the singleton.
 */
export function assertDatabaseReady(connection: Database = sqlite) {
  const rows = connection
    .query("SELECT name FROM sqlite_master WHERE type in ('table', 'view')")
    .all()
    .map((row) => String((row as { name: string }).name))
  const missing = requiredTables.filter((table) => !rows.includes(table))
  if (missing.length) {
    throw new Error(
      `Database schema is missing required table(s): ${missing.join(', ')}. ` +
        'Run the database migrations (bun run db:migrate) before starting the server.',
    )
  }
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const existing = new Set(tableColumns(connection, table))
    const missingColumns = columns.filter((column) => !existing.has(column))
    if (missingColumns.length) {
      throw new Error(
        `Database table "${table}" is missing required column(s): ${missingColumns.join(', ')}. ` +
          'Run the database migrations (bun run db:migrate) before starting the server.',
      )
    }
  }
}
