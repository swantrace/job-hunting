import '../db/cli-database'
import { db } from '../db/client'
import { syncSkillTaxonomy } from '../lib/skills/sync-taxonomy'
import { loadSkillTaxonomy } from '../lib/skills/taxonomy'

/**
 * Legacy import-only taxonomy sync (retired in Step 12).
 *
 * `skill-taxonomy.json` is no longer a runtime source: categories live in
 * `skill_categories` and are managed under Skills settings in the UI. This CLI
 * remains only as an explicit one-off import of a JSON taxonomy file. Prefer
 * `bun run career:import --source <dir>` for a full career dataset; nothing at
 * boot runs this command. The target database is explicit: pass
 * `--database <path>` or set `DB_FILE_NAME`.
 */

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const check = args.includes('--check')

try {
  const taxonomy = loadSkillTaxonomy()
  const report = syncSkillTaxonomy(db, taxonomy.categories, { apply })
  console.log(
    apply ? 'Skill taxonomy synchronized.' : 'Skill taxonomy dry-run (no changes applied).',
  )
  console.log(`inserted: ${report.inserted}`)
  console.log(`updated: ${report.updated}`)
  console.log(`unchanged: ${report.unchanged}`)
  console.log(`orphaned: ${report.orphaned.length}`)
  for (const key of report.orphaned) console.warn(`orphaned: ${key}`)
  if (check && report.orphaned.length) process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
