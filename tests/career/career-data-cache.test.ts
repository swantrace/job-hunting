import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { listCareerDirections } from '../../src/db/career-directions'
import { listCareerAchievements, updateCareerAchievement } from '../../src/db/career-records'
import { careerRecordDirections, skills } from '../../src/db/schema'
import { renameSkill } from '../../src/db/skill-service'
import { loadCareerData } from '../../src/lib/career/canonical-data'
import { createCareerTestDatabase } from '../support/career-db'

/**
 * The assembler cache is memoized on `careerContentProbe`, so a workspace render
 * only re-queries the whole dataset when something actually changed. These are
 * the two staleness cases the computed probe fixes: a catalog rename (which used
 * to have no counter of its own) and a direction-link change.
 */

function firstFreeDirection(
  executor: Parameters<typeof listCareerAchievements>[0],
  achievement: ReturnType<typeof listCareerAchievements>[number],
) {
  return listCareerDirections(executor)
    .map((direction) => direction.key)
    .find((key) => !achievement.directions.includes(key))
}

describe('loadCareerData cache refresh', () => {
  test('refreshes after a same-count junction replacement without touching parent timestamps', () => {
    const database = createCareerTestDatabase()
    const { executor } = database
    try {
      const achievement = listCareerAchievements(executor).find(
        (row) => row.directions.length > 0 && firstFreeDirection(executor, row),
      )!
      const next = firstFreeDirection(executor, achievement)!
      const before = loadCareerData(executor)
      const links = executor.select().from(careerRecordDirections).all()
      const link = links.find((row) => row.achievementId === achievement.id)!
      executor
        .update(careerRecordDirections)
        .set({ directionKey: next })
        .where(eq(careerRecordDirections.id, link.id))
        .run()
      expect(executor.select().from(careerRecordDirections).all()).toHaveLength(links.length)
      const after = loadCareerData(executor)
      expect(after).not.toBe(before)
      expect(
        after.achievements.achievements.find((row) => row.id === achievement.stableKey)?.directions,
      ).toContain(next)
    } finally {
      database.cleanup()
    }
  })

  test('refreshes after a catalog rename', async () => {
    const database = createCareerTestDatabase()
    const { executor } = database
    try {
      const before = loadCareerData(executor)
      expect(loadCareerData(executor)).toBe(before)

      const skill = executor
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.key, 'typescript'))
        .get()
      if (!skill) throw new Error('Synthetic typescript catalog entry is missing.')
      await Bun.sleep(2)
      renameSkill(skill.id, 'TypeScript (renamed)', executor)

      const after = loadCareerData(executor)
      expect(after).not.toBe(before)
      expect(after.skills.skills.find((item) => item.id === 'typescript')?.label).toBe(
        'TypeScript (renamed)',
      )
    } finally {
      database.cleanup()
    }
  })

  test('refreshes after a direction-link change', () => {
    const database = createCareerTestDatabase()
    const { executor } = database
    try {
      const before = loadCareerData(executor)
      const achievement = listCareerAchievements(executor)[0]
      if (!achievement) throw new Error('Synthetic achievement is missing.')
      const nextDirection = firstFreeDirection(executor, achievement)
      if (!nextDirection) throw new Error('Synthetic data has no free direction to link.')

      updateCareerAchievement(executor, achievement.id, {
        stableKey: achievement.stableKey,
        experienceId: achievement.experienceId,
        claim: achievement.claim,
        safeToUse: achievement.safeToUse,
        evidence: achievement.evidence,
        evidenceNarratives: achievement.evidenceNarratives,
        limitations: achievement.limitations,
        skills: achievement.skills,
        directions: [...achievement.directions, nextDirection],
        publicationIds: achievement.publicationIds,
      })

      const after = loadCareerData(executor)
      expect(after).not.toBe(before)
      const updated = after.achievements.achievements.find(
        (item) => item.id === achievement.stableKey,
      )
      expect(updated?.directions).toContain(nextDirection)
    } finally {
      database.cleanup()
    }
  })
})
