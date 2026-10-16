import { eq, sql } from 'drizzle-orm'
import { nowISO } from '../lib/date'
import type { CareerDb } from './career-shared'
import { db } from './client'
import { analysisRunDecisions, jobRequirementSkillMentions, skills } from './schema'

/** Keep source mentions and immutable run/artifact history when removing a catalog mistake. */
export function deleteCatalogSkill(id: number, executor: CareerDb = db) {
  return executor.transaction((tx) => {
    tx.update(jobRequirementSkillMentions)
      .set({
        mappingState: 'skipped',
        resolvedSkillId: null,
        revision: sql`${jobRequirementSkillMentions.revision} + 1`,
        updatedAt: nowISO(),
      })
      .where(eq(jobRequirementSkillMentions.resolvedSkillId, id))
      .run()
    tx.delete(analysisRunDecisions).where(eq(analysisRunDecisions.skillId, id)).run()
    // Personal career references and incoming merge redirects remain RESTRICT.
    // If either prevents deletion, SQLite rolls back the preceding changes too.
    return tx.delete(skills).where(eq(skills.id, id)).run()
  })
}
