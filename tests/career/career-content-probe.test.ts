import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { listCareerDirections } from '../../src/db/career-directions'
import { saveCareerCandidate } from '../../src/db/career-facts'
import {
  createCareerEducation,
  listCareerAchievements,
  updateCareerAchievement,
} from '../../src/db/career-records'
import { careerContentProbe } from '../../src/db/career-shared'
import { skillCategories, skills } from '../../src/db/schema'
import { renameSkill } from '../../src/db/skill-service'
import { syncSkillTaxonomy } from '../../src/lib/skills/sync-taxonomy'
import { createCareerTestDatabase } from '../support/career-db'

/**
 * The computed change probe replaced `career_state.revision` + `content_hash`.
 * It must be a pure function of the data (stable with no writes) and must notice
 * every kind of write that can change the canonical career shape: profile,
 * record, catalog, category and junction rows.
 */

function achievementInput(
  record: ReturnType<typeof listCareerAchievements>[number],
  directions: string[],
) {
  return {
    stableKey: record.stableKey,
    experienceId: record.experienceId,
    claim: record.claim,
    safeToUse: record.safeToUse,
    evidence: record.evidence,
    evidenceNarratives: record.evidenceNarratives,
    limitations: record.limitations,
    skills: record.skills,
    directions,
    publicationIds: record.publicationIds,
  }
}

describe('careerContentProbe', () => {
  test('is stable across repeated calls with no writes', () => {
    const database = createCareerTestDatabase()
    try {
      const first = careerContentProbe(database.executor)
      expect(first).toHaveLength(64)
      expect(careerContentProbe(database.executor)).toBe(first)
    } finally {
      database.cleanup()
    }
  })

  test('changes after a profile, record, catalog, category and junction write', async () => {
    const database = createCareerTestDatabase()
    const { executor } = database
    try {
      const baseline = careerContentProbe(executor)

      // Profile singleton.
      await Bun.sleep(2)
      saveCareerCandidate(executor, { fullName: 'Probe Candidate' })
      const afterProfile = careerContentProbe(executor)
      expect(afterProfile).not.toBe(baseline)

      // New record row.
      createCareerEducation(executor, {
        stableKey: 'probe-education',
        degree: 'BSc',
        school: 'Probe Institute',
      })
      const afterRecord = careerContentProbe(executor)
      expect(afterRecord).not.toBe(afterProfile)

      // Catalog rename (the staleness this probe replaces).
      const skill = executor
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.key, 'typescript'))
        .get()
      if (!skill) throw new Error('Synthetic typescript catalog entry is missing.')
      await Bun.sleep(2)
      renameSkill(skill.id, 'TypeScript (renamed)', executor)
      const afterCatalog = careerContentProbe(executor)
      expect(afterCatalog).not.toBe(afterRecord)

      // Category reorder.
      const category = executor.select().from(skillCategories).limit(1).get()
      if (!category) throw new Error('Synthetic skill category is missing.')
      await Bun.sleep(2)
      syncSkillTaxonomy(
        executor,
        [{ key: category.key, label: category.label, sortOrder: category.sortOrder + 5 }],
        { apply: true },
      )
      const afterCategory = careerContentProbe(executor)
      expect(afterCategory).not.toBe(afterCatalog)

      // Direction-link junction row.
      const achievement = listCareerAchievements(executor)[0]
      if (!achievement) throw new Error('Synthetic achievement is missing.')
      const nextDirection = listCareerDirections(executor)
        .map((direction) => direction.key)
        .find((key) => !achievement.directions.includes(key))
      if (!nextDirection) throw new Error('Synthetic data has no free direction to link.')
      updateCareerAchievement(executor, achievement.id, {
        ...achievementInput(achievement, [...achievement.directions, nextDirection]),
      })
      expect(careerContentProbe(executor)).not.toBe(afterCategory)
    } finally {
      database.cleanup()
    }
  })
})
