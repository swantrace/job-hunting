import '../db/cli-database'
import { Database } from 'bun:sqlite'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../db/schema'
import {
  applyCareerImport,
  type CareerImportSource,
  prepareCareerImport,
} from '../lib/career-import'

/**
 * Transactional career data import.
 *
 *   bun run career:import --source career-data --database ./jobs.db            # dry run (default)
 *   bun run career:import --source dataset.json --database ./jobs.db --apply   # write in one transaction
 *   bun run career:import --source career-data --database ./jobs.db --apply
 *
 * `--source` is a directory (legacy `career-data/*.json` plus taxonomy and Base
 * Resumes) or a `career-dataset` JSON file. The dry run prints the source hash,
 * per-kind counts and every conflict without writing anything.
 */

const args = process.argv.slice(2)

function flagValue(name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function printHelp() {
  console.log(`Usage: bun run career:import --source <path> [options]

Options:
  --source <path>     Directory of legacy career JSON, or a career-dataset file. Required.
  --database <path>   SQLite database to import into. Required: pass this or set DB_FILE_NAME.
  --apply            Write the import in one transaction (default is a dry run).
  --help             Show this help.

A stale preview (source bytes or database fingerprint changed) is rejected; run a
new dry run before applying. Conflicts always block the import. An import merges
by stable key and never deletes records missing from the source.`)
}

function openDatabase(databasePath: string) {
  const sqlite = new Database(databasePath, { create: true })
  sqlite.exec('PRAGMA foreign_keys = ON;')
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

function main() {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  const sourceArgument = flagValue('--source')
  if (!sourceArgument) {
    console.error('--source is required. Pass a career-data directory or a career-dataset file.')
    process.exitCode = 1
    return
  }
  const sourcePath = resolve(sourceArgument)
  if (!existsSync(sourcePath)) {
    console.error(`Import source "${sourcePath}" does not exist.`)
    process.exitCode = 1
    return
  }

  const databasePath = resolve(process.env.DB_FILE_NAME as string)
  const apply = args.includes('--apply')
  const source: CareerImportSource = statSync(sourcePath).isDirectory()
    ? { kind: 'directory', directory: sourcePath }
    : { kind: 'dataset', json: null, path: sourcePath }

  const { sqlite, db } = openDatabase(databasePath)
  try {
    console.log(`Database: ${databasePath}`)
    console.log(`Source: ${sourcePath} (${source.kind})`)
    const preview = prepareCareerImport(db, source)
    console.log(`Source hash: ${preview.sourceHash}`)
    console.log(`Database fingerprint: ${preview.databaseRevision}`)
    const kinds = Object.entries(preview.report.byKind).sort(([left], [right]) =>
      left.localeCompare(right),
    )
    if (kinds.length === 0) console.log('Planned changes: none')
    for (const [kind, counts] of kinds) {
      console.log(
        `${kind}: inserted ${counts.inserted}, updated ${counts.updated}, unchanged ${counts.unchanged}`,
      )
    }
    console.log(
      `Total: inserted ${preview.report.inserted}, updated ${preview.report.updated}, unchanged ${preview.report.unchanged}`,
    )
    for (const conflict of preview.conflicts) console.log(`conflict: ${conflict}`)
    if (preview.conflicts.length > 0) {
      console.error(
        `Import blocked by ${preview.conflicts.length} conflict(s); nothing was written.`,
      )
      process.exitCode = 1
      return
    }
    if (!apply) {
      console.log('Dry run complete (no changes applied). Re-run with --apply to write.')
      return
    }
    const report = applyCareerImport(db, preview)
    console.log(
      `Applied: inserted ${report.inserted}, updated ${report.updated}, unchanged ${report.unchanged}`,
    )
  } catch (error) {
    console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    sqlite.close()
  }
}

main()
