import { sqlite } from '../db/client'
import { consolidateLegacyMergedSkills } from '../db/skill-service'

try {
  console.log(`Consolidated ${consolidateLegacyMergedSkills()} legacy merged skills.`)
} finally {
  sqlite.close()
}
