import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import { reconcileSkillNames } from '../../src/db/skill-queries'
import { skillDecisionSchema } from '../../src/lib/validation'
import { migratedDatabase, seedApplication } from '../support/sqlite'

function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

describe('application skill requirement persistence', () => {
  test('re-saving an unchanged application preserves user decisions and reasons', () => {
    const { sqlite, db } = database()
    try {
      const { applicationId } = seedApplication(sqlite)
      reconcileSkillNames(db, applicationId, ['React'])

      const relation = db
        .select()
        .from(schema.jobApplicationsToSkills)
        .where(eq(schema.jobApplicationsToSkills.jobApplicationId, applicationId))
        .get()
      expect(relation?.skillId).toBeGreaterThan(0)

      sqlite
        .query(
          'UPDATE job_applications_to_skills SET user_decision = ?, decision_reason = ? WHERE job_application_id = ? AND skill_id = ?',
        )
        .run('skip', 'Not relevant to this application.', applicationId, relation!.skillId)

      reconcileSkillNames(db, applicationId, ['React'])

      const after = db
        .select()
        .from(schema.jobApplicationsToSkills)
        .where(eq(schema.jobApplicationsToSkills.jobApplicationId, applicationId))
        .get()
      expect(after?.userDecision).toBe('skip')
      expect(after?.decisionReason).toBe('Not relevant to this application.')
    } finally {
      sqlite.close()
    }
  })

  test('collapses repeated spellings of the same canonical skill into one relation', () => {
    const { sqlite, db } = database()
    try {
      const { applicationId } = seedApplication(sqlite)
      reconcileSkillNames(db, applicationId, ['React', 'react', ' react '])
      const rows = db
        .select()
        .from(schema.jobApplicationsToSkills)
        .where(eq(schema.jobApplicationsToSkills.jobApplicationId, applicationId))
        .all()
      expect(rows).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })

  test('removes only skills that leave the edited list, never unrelated relations', () => {
    const { sqlite, db } = database()
    try {
      const { applicationId } = seedApplication(sqlite)
      reconcileSkillNames(db, applicationId, ['React', 'Vue'])
      reconcileSkillNames(db, applicationId, ['React'])

      const names = db
        .select({ name: schema.skills.name })
        .from(schema.jobApplicationsToSkills)
        .innerJoin(schema.skills, eq(schema.jobApplicationsToSkills.skillId, schema.skills.id))
        .where(eq(schema.jobApplicationsToSkills.jobApplicationId, applicationId))
        .all()
        .map((row) => row.name)
      expect(names).toEqual(['React'])
    } finally {
      sqlite.close()
    }
  })

  test('forged Include decisions without a reason fail the server schema', () => {
    expect(skillDecisionSchema.safeParse({ action: 'include', reason: '' }).success).toBe(false)
    expect(skillDecisionSchema.safeParse({ action: 'skip', reason: '' }).success).toBe(true)
    expect(
      skillDecisionSchema.safeParse({
        action: 'include',
        reason: 'Used this in a personal event-processing prototype.',
      }).success,
    ).toBe(true)
  })
})
