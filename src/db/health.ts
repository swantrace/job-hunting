import { Database } from 'bun:sqlite'
import { sqlite } from './client'

const requiredTables = [
  'companies',
  'job_requirements_to_skills',
  'job_postings',
  'generation_runs',
]

// Columns added to existing tables by later migrations. Checked here so a
// partially-applied or drift-out-of-sync migration fails fast at boot with a
// readable message instead of surfacing mid-request (e.g. during generation).
const requiredColumns: Record<string, string[]> = {
  generation_run_results: [
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
    .query("SELECT name FROM sqlite_master WHERE type = 'table'")
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
