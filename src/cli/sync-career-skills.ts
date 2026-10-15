import '../db/cli-database'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '../db/client'
import { readCareerDataDirectory } from '../lib/career-data'
import { syncCareerSkills } from '../lib/skills/sync-career-skills'

/**
 * Legacy import-only career-data -> SQLite skill sync (retired in Step 12).
 *
 * Personal skills, their catalog entries and aliases are edited in the Career
 * Data UI and imported transactionally with `bun run career:import`. This CLI is
 * kept as an explicit one-off import from a legacy `career-data/` directory;
 * boot (`setup`/`start`) never runs it. The target database is explicit: pass
 * `--database <path>` or set `DB_FILE_NAME`.
 *
 *   bun run skills:sync            # dry-run (default)
 *   bun run skills:sync --apply    # write inside a transaction
 *   bun run skills:sync --check    # non-zero exit on conflicts
 *   bun run skills:sync --if-present  # skip silently when career-data is not mounted
 */

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const check = args.includes('--check')
const ifPresent = args.includes('--if-present')

function canonicalCareerDataDir() {
  const configured = process.env.CAREER_DATA_DIR?.trim()
  const candidates = [
    configured,
    resolve(process.cwd(), 'career-data'),
    resolve(process.cwd(), '..', 'career-data'),
  ]
  return candidates.filter((candidate): candidate is string => Boolean(candidate)).find(existsSync)
}

function main() {
  if (!canonicalCareerDataDir()) {
    if (ifPresent) {
      console.log('career-data is not mounted; skipping career skill sync.')
      return
    }
    console.error('career-data directory was not found. Mount it or set CAREER_DATA_DIR.')
    process.exitCode = 1
    return
  }

  let data
  try {
    data = readCareerDataDirectory(canonicalCareerDataDir()!)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (ifPresent) {
      // Never take the server down for mounted-but-invalid career data.
      console.warn(`career-data is present but failed validation; skipping sync: ${message}`)
      return
    }
    console.error(`career-data failed validation: ${message}`)
    process.exitCode = 1
    return
  }

  const report = syncCareerSkills(db, data, { apply })

  const lines = [
    `inserted: ${report.inserted}`,
    `updated: ${report.updated}`,
    `unchanged: ${report.unchanged}`,
    `conflicted: ${report.conflicted}`,
  ]
  console.log(
    apply ? 'Career skills synchronized.' : 'Career skill sync dry-run (no changes applied).',
  )
  console.log(lines.join('\n'))
  for (const conflict of report.conflicts) console.log(`conflict: ${conflict}`)

  if (check && report.conflicted > 0) process.exitCode = 1
}

main()
