import { describe, expect, test } from 'bun:test'
import { candidateStalenessReasons } from '../../src/lib/candidate-analysis'
import { canonicalHash } from '../../src/lib/canonical-hash'
import type { CanonicalCareerData } from '../../src/lib/career-data'
import { safeCareerData } from '../../src/lib/document-draft-input'
import { loadExampleCareerData } from '../support/career-data'

/**
 * Career evidence freshness identity. `generation-input.ts` hashes
 * `safeCareerData(loadCareerData())` as the document evidence hash and
 * `candidate-analysis.ts` hashes the same safe career shape inside its snapshot.
 * Portfolio topics are editorial planning data: they are deliberately outside
 * that identity, so editing only the portfolio must not mark an unrelated
 * analysis or generated document stale.
 */

function candidateSnapshot(careerData: CanonicalCareerData) {
  return { version: 2, jobAnalysis: { runId: 1 }, careerData: safeCareerData(careerData) }
}

function portfolioEdited(data: CanonicalCareerData): CanonicalCareerData {
  const topic = data.portfolio.topics[0]
  if (!topic) throw new Error('The example career data has no portfolio topic to edit.')
  data.portfolio.topics[0] = {
    ...topic,
    title: 'A completely rewritten portfolio topic',
    status: 'published',
    sortOrder: 99,
    outline: ['New outline entry'],
    details: 'New editorial detail.',
  }
  return data
}

describe('portfolio-only edits do not stale unrelated documents', () => {
  test('the portfolio is outside the safe document shape', () => {
    const safe = safeCareerData(loadExampleCareerData())
    expect(Object.keys(safe)).not.toContain('portfolio')
  })

  test('the evidence hash and the candidate career-data sub-hash are unchanged', () => {
    const before = loadExampleCareerData()
    const after = portfolioEdited(structuredClone(before))

    expect(canonicalHash(safeCareerData(after))).toBe(canonicalHash(safeCareerData(before)))
    expect(candidateStalenessReasons(candidateSnapshot(before), candidateSnapshot(after))).toEqual(
      [],
    )
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
