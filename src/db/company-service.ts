import { and, eq, sql } from 'drizzle-orm'
import { db } from './client'
import { companies, contacts, jobApplications } from './schema'
import type { SkillDb } from './skill-service'

/**
 * Merges a duplicate company into a target company in one transaction. All
 * applications and contacts move to the target, and a contact whose email
 * already exists on the target blocks the merge rather than silently dropping
 * history. The source company is removed only once it is unreferenced.
 */
export function mergeCompanies(sourceId: number, targetId: number, executor: SkillDb = db) {
  if (sourceId === targetId) throw new Error('A company cannot be merged into itself.')
  return executor.transaction((tx) => {
    const source = tx.select().from(companies).where(eq(companies.id, sourceId)).get()
    const target = tx.select().from(companies).where(eq(companies.id, targetId)).get()
    if (!source || !target) throw new Error('Company not found.')

    const sourceContacts = tx.select().from(contacts).where(eq(contacts.companyId, sourceId)).all()
    for (const contact of sourceContacts) {
      const conflict = tx
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.companyId, targetId),
            sql`lower(${contacts.email}) = lower(${contact.email})`,
          ),
        )
        .get()
      if (conflict)
        throw new Error(`Contact "${contact.name}" already exists on the target company.`)
    }

    tx.update(jobApplications)
      .set({ companyId: targetId })
      .where(eq(jobApplications.companyId, sourceId))
      .run()
    tx.update(contacts).set({ companyId: targetId }).where(eq(contacts.companyId, sourceId)).run()
    tx.delete(companies).where(eq(companies.id, sourceId)).run()
    return { sourceId, targetId }
  })
}
