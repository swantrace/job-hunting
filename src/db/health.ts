import { Database } from 'bun:sqlite'
import { sqlite } from './client'

const requiredTables = [
  'companies',
  'job_requirements_to_skills',
  'job_postings',
  'generation_runs',
]

/**
 * Startup schema readiness check. Fails with a readable message when the
 * canonical tables are missing instead of surfacing a cryptic "no such table"
 * error later from a random route query. Accepts an optional connection for
 * isolated testing; production uses the singleton.
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
}
