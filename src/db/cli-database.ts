/**
 * Explicit database selection for command-line entrypoints.
 *
 * The app server may default to `./jobs.db` for normal dev and production use,
 * but a CLI must never silently open that file: merely importing
 * `src/db/client.ts` opens (and can checkpoint) whatever `DB_FILE_NAME` points
 * at, so an accidental CLI run without an explicit database could read or write
 * production data.
 *
 * Every CLI entrypoint therefore imports this module FIRST as a side effect:
 *
 *   import '../db/cli-database'
 *
 * Importing it resolves `--database <path>` (or `DB_FILE_NAME`), assigns the
 * result to `DB_FILE_NAME` before any database module is evaluated, and throws a
 * clear error when neither is supplied. The app server path is unchanged:
 * `src/db/client.ts` still reads `DB_FILE_NAME ?? 'jobs.db'`.
 */

export function resolveCliDatabasePath(
  explicit?: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const provided = explicit?.trim() || env.DB_FILE_NAME?.trim()
  if (!provided) {
    throw new Error(
      'No database selected: pass --database <path> or set DB_FILE_NAME. ' +
        'Refusing to fall back to ./jobs.db because a CLI could then read or write production data.',
    )
  }
  return provided
}

/** Reads `--database <path>` from raw CLI arguments. */
export function cliDatabaseFlag(
  args: readonly string[] = process.argv.slice(2),
): string | undefined {
  const index = args.indexOf('--database')
  if (index === -1) return undefined
  const value = args[index + 1]?.trim()
  if (!value || value.startsWith('--')) throw new Error('--database requires a path value.')
  return value
}

// Runs on import, before any module that opens the database is evaluated.
process.env.DB_FILE_NAME = resolveCliDatabasePath(cliDatabaseFlag())
