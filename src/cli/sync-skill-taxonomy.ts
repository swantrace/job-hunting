import { db } from '../db/client'
import { syncSkillTaxonomy } from '../lib/skills/sync-taxonomy'
import { loadSkillTaxonomy } from '../lib/skills/taxonomy'

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
