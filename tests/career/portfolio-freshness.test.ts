import { describe, expect, test } from 'bun:test'
import { readCareerStateDocuments, writeCareerStateDocuments } from '../../src/db/career-state'
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
 * Data outside that identity — preserved legacy documents such as
 * `portfolio-content.json`, and category display ordering — is deliberately
 * excluded, so editing only that data must not mark an unrelated analysis or
 * generated document stale, even though it bumps `career_state.revision`.
 */

function candidateSnapshot(careerData: CanonicalCareerData) {
  return { version: 2, jobAnalysis: { runId: 1 }, careerData: safeCareerData(careerData) }
}

/**
 * The surviving equivalent of a portfolio-only edit: the raw
 * `portfolio-content.json` document is preserved in
 * `career_state.legacy_documents_json` and rewritten, which bumps
 * `career_state.revision`, but nothing it holds reaches the document shape. The
 * other preserved documents are carried over untouched, so the assertion proves
 * the identity is derived from the document shape rather than the revision
 * counter.
 */
function preservedDocumentEdited(executor: Parameters<typeof writeCareerStateDocuments>[0]): void {
  const current = readCareerStateDocuments(executor).legacyDocuments as Record<string, unknown>
  writeCareerStateDocuments(executor, {
    legacyDocuments: {
      ...current,
      'portfolio-content.json': {
        schemaVersion: 1,
        lastUpdated: '2026-10-20',
        topics: [
          {
            id: 'a-preserved-portfolio-topic',
            title: 'A preserved raw portfolio topic',
            projects: ['synthetic-tracker'],
            directions: ['fullstack'],
          },
        ],
      },
    },
  })
}

describe('edits outside the document shape do not stale unrelated documents', () => {
  test('a preserved legacy-document edit bumps the revision but not the identity', () => {
    const database: CareerTestDatabase = careerTestDatabase()
    const { sqlite, executor } = database
    try {
      const before = loadCareerDataFromDatabase(executor)
      const revisionBefore = (
        sqlite.query('SELECT revision FROM career_state WHERE id = 1').get() as { revision: number }
      ).revision

      preservedDocumentEdited(executor)

      const revisionAfter = (
        sqlite.query('SELECT revision FROM career_state WHERE id = 1').get() as { revision: number }
      ).revision
      expect(revisionAfter).toBeGreaterThan(revisionBefore)
      // The preserved document really was stored, proving the trigger ran.
      expect(
        (
          sqlite.query('SELECT legacy_documents_json FROM career_state WHERE id = 1').get() as {
            legacy_documents_json: string
          }
        ).legacy_documents_json,
      ).toContain('a-preserved-portfolio-topic')

      // The document shape did not change: the evidence hash and the candidate
      // career-data sub-hash are untouched even though the revision advanced.
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
