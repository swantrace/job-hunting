import { Database } from 'bun:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../db/schema'
import { buildCareerDataset, serializeCareerDataset } from '../lib/career-export'

/**
 * Exports a portable, versioned `career-dataset`.
 *
 *   bun run career:export --out career-export.json
 *   bun run career:export --out fullstack.json --direction fullstack
 *   bun run career:export --database ./jobs.db > career-export.json
 *
 * The export is logical: it carries editorial career facts and stable keys, never
 * OAuth credentials, application history or artifact binaries. The payload's
 * `excluded` note records that limitation; a full recovery needs a consistent
 * SQLite backup.
 */

const args = process.argv.slice(2)

function flagValue(name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function printHelp() {
  console.log(`Usage: bun run career:export [options]

Options:
  --out <path>        Write the dataset to this file (default: stdout).
  --direction <key>   Export only this direction and the records linked to it.
  --database <path>   SQLite database to export from (default: DB_FILE_NAME or ./jobs.db).
  --help              Show this help.`)
}

function main() {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  const databaseArgument = flagValue('--database')
  const databasePath = resolve(databaseArgument ?? process.env.DB_FILE_NAME ?? 'jobs.db')
  const direction = flagValue('--direction')
  const outputPath = flagValue('--out')

  const sqlite = new Database(databasePath, { create: true })
  try {
    const db = drizzle({ client: sqlite, schema })
    const dataset = buildCareerDataset(db, {
      scope: direction ? { directionKey: direction } : 'full',
    })
    const json = serializeCareerDataset(dataset)
    if (outputPath) {
      const target = resolve(outputPath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, json)
      console.log(
        `Wrote ${dataset.scope.kind === 'full' ? 'full' : 'direction'} export to ${target}`,
      )
    } else {
      process.stdout.write(json)
    }
  } catch (error) {
    console.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    sqlite.close()
  }
}

main()
