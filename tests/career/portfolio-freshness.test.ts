import { describe, expect, test } from 'bun:test'
import { saveCareerPreferences } from '../../src/db/career-facts'
import { careerContentProbe } from '../../src/db/career-shared'
import { candidateStalenessReasons } from '../../src/lib/candidate-analysis'
import { canonicalHash } from '../../src/lib/canonical-hash'
import { type CanonicalCareerData, loadCareerDataFromDatabase } from '../../src/lib/career-data'
import { safeCareerData } from '../../src/lib/document-draft-input'
import { loadExampleCareerData } from '../support/career-data'
import { type CareerTestDatabase, careerTestDatabase } from '../support/career-db'

/**
 * Career evidence freshness identity. `generation-input.ts` hashes
 * `safeCareerData(loadCareerData())` as the document evidence hash and
 * `candidate-analysis.ts` hashes the same safe career shape inside its snapshot.
 * Data outside that identity — the preferences half of the `career_profile`
 * singleton, and preserved document roots such as `portfolio-content.json` — is
 * deliberately excluded, so editing only that data must not mark an unrelated
 * analysis or generated document stale, even though it advances the computed
 * change probe that replaced `career_state.revision`.
 */

function candidateSnapshot(careerData: CanonicalCareerData) {
  return { version: 2, jobAnalysis: { runId: 1 }, careerData: safeCareerData(careerData) }
}

describe('edits outside the document shape do not stale unrelated documents', () => {
  test('a preferences edit advances the change probe but not the identity', async () => {
    const database: CareerTestDatabase = careerTestDatabase()
    const { executor } = database
    try {
      const before = loadCareerDataFromDatabase(executor)
      const probeBefore = careerContentProbe(executor)

      // A real career write the safe document shape excludes: the preferences
      // half of the profile singleton. `saveCareerPreferences` advances the
      // probe through the row's `updated_at`, but nothing it stores reaches the
      // generated document shape.
      await Bun.sleep(2)
      saveCareerPreferences(executor, {
        locations: ['Nowhere'],
        notes: 'Preference edit outside the document shape.',
      })

      expect(careerContentProbe(executor)).not.toBe(probeBefore)

      // The document shape did not change: the evidence hash and the candidate
      // career-data sub-hash are untouched even though the probe advanced.
      const after = loadCareerDataFromDatabase(executor)
      expect(canonicalHash(safeCareerData(after))).toBe(canonicalHash(safeCareerData(before)))
      expect(
        candidateStalenessReasons(candidateSnapshot(before), candidateSnapshot(after)),
      ).toEqual([])
    } finally {
      database.cleanup()
    }
  })

  test('a real career fact edit still changes the identity', () => {
    const before = loadExampleCareerData()
    const after = structuredClone(before)
    const achievement = after.achievements.achievements[0]
    if (!achievement) throw new Error('The example career data has no achievement to edit.')
    achievement.claim = `${achievement.claim} (edited fact)`

    expect(canonicalHash(safeCareerData(after))).not.toBe(canonicalHash(safeCareerData(before)))
    expect(
      candidateStalenessReasons(candidateSnapshot(before), candidateSnapshot(after)),
    ).toContain('career-data-changed')
  })
})
