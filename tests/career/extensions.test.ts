import { describe, expect, test } from 'bun:test'
import { listBaseResumeVersions } from '../../src/db/career-base-resumes'
import {
  listCareerAchievements,
  listCareerEducation,
  listCareerExperiences,
  listCareerProjects,
  listCareerPublications,
  listCareerStories,
} from '../../src/db/career-records'
import { listCareerSkills } from '../../src/db/career-skills'
import { storedRecordExtensions, writeRecordExtensions } from '../../src/lib/career/extensions'
import { createCareerTestDatabase } from '../support/career-db'

/**
 * Preserved authored fields moved from the `career_state` archive onto each
 * record's own `extension_json` column (and the `career_profile` singleton for
 * `candidate`/`preferences`). Every kind the editors expose must round-trip
 * through that column, stay no-op aware, and leave no residue when emptied.
 */
describe('per-table extension columns', () => {
  test('round-trips every kind and removes an emptied extension', () => {
    const database = createCareerTestDatabase()
    const { executor } = database
    try {
      const education = listCareerEducation(executor, { includeRetired: true })[0]
      const experience = listCareerExperiences(executor, { includeRetired: true })[0]
      const achievement = listCareerAchievements(executor, { includeRetired: true })[0]
      const project = listCareerProjects(executor, { includeRetired: true })[0]
      const story = listCareerStories(executor, { includeRetired: true })[0]
      const publication = listCareerPublications(executor, { includeRetired: true })[0]
      const personalSkill = listCareerSkills(executor, { includeRetired: true })[0]
      const baseResume = listBaseResumeVersions(executor, 'fullstack')[0]
      if (
        !education ||
        !experience ||
        !achievement ||
        !project ||
        !story ||
        !publication ||
        !personalSkill ||
        !baseResume
      ) {
        throw new Error('Synthetic career fixtures did not seed every record kind.')
      }

      const targets = [
        { kind: 'candidate', key: '$' },
        { kind: 'preferences', key: '$' },
        { kind: 'education', key: education.stableKey },
        { kind: 'experiences', key: experience.stableKey },
        { kind: 'achievements', key: achievement.stableKey },
        { kind: 'projects', key: project.stableKey },
        { kind: 'stories', key: story.stableKey },
        { kind: 'publications', key: publication.stableKey },
        { kind: 'personalSkills', key: personalSkill.skillKey },
        { kind: 'baseResumes', key: `${baseResume.directionKey}#${baseResume.version}` },
      ] as const

      for (const { kind, key } of targets) {
        const value = { [kind]: true, nested: { depth: 1 } }
        expect(writeRecordExtensions(executor, kind, key, value)).toBe(true)
        expect(storedRecordExtensions(executor, kind, key)).toEqual(value)
        // An identical write is invisible.
        expect(writeRecordExtensions(executor, kind, key, value)).toBe(false)
        // Clearing the last field removes it rather than storing an empty object.
        expect(writeRecordExtensions(executor, kind, key, null)).toBe(true)
        expect(storedRecordExtensions(executor, kind, key)).toBeNull()
        expect(writeRecordExtensions(executor, kind, key, null)).toBe(false)
      }
    } finally {
      database.cleanup()
    }
  })

  test('keeps candidate and preferences extras on the shared profile column', () => {
    const database = createCareerTestDatabase()
    const { executor } = database
    try {
      expect(writeRecordExtensions(executor, 'candidate', '$', { preferredName: 'Jordan' })).toBe(
        true,
      )
      expect(storedRecordExtensions(executor, 'preferences', '$')).toEqual({
        preferredName: 'Jordan',
      })
      expect(writeRecordExtensions(executor, 'preferences', '$', null)).toBe(true)
      expect(storedRecordExtensions(executor, 'candidate', '$')).toBeNull()
    } finally {
      database.cleanup()
    }
  })
})
