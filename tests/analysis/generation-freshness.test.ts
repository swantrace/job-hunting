import { describe, expect, test } from 'bun:test'
import { generationStalenessReasons } from '../../src/lib/generation-input'
import { migratedDatabase } from '../support/sqlite'

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    candidateAnalysisRunId: 1,
    candidateAnalysisInputHash: 'candidate-hash',
    confirmedProfileId: 'fullstack',
    decisions: [{ skillId: 1, decision: 'skip' }],
    reasons: [],
    evidenceHash: 'evidence-hash',
    generationPromptVersion: '2.1.0',
    generationSchemaVersion: '2.1.0',
    resumeModel: 'gpt-5.6-sol',
    coverLetterModel: 'gpt-5.6-terra',
    ...overrides,
  }
}

describe('generation staleness reason codes', () => {
  test('returns no reasons for identical inputs', () => {
    expect(generationStalenessReasons(snapshot(), snapshot())).toEqual([])
  })

  test('detects candidate analysis changes', () => {
    const reasons = generationStalenessReasons(
      snapshot(),
      snapshot({ candidateAnalysisInputHash: 'other-hash' }),
    )
    expect(reasons).toContain('candidate-analysis-changed')
  })

  test('detects profile selection changes', () => {
    const reasons = generationStalenessReasons(
      snapshot(),
      snapshot({ confirmedProfileId: 'frontend' }),
    )
    expect(reasons).toContain('profile-selection-changed')
  })

  test('detects skill decision changes', () => {
    const reasons = generationStalenessReasons(
      snapshot(),
      snapshot({
        decisions: [{ skillId: 1, decision: 'include' }],
        reasons: [{ skillId: 1, reason: 'Used in a prototype.' }],
      }),
    )
    expect(reasons).toContain('skill-decisions-changed')
  })

  test('detects career evidence changes', () => {
    const reasons = generationStalenessReasons(snapshot(), snapshot({ evidenceHash: 'other' }))
    expect(reasons).toContain('career-evidence-changed')
  })

  test('detects generation contract changes', () => {
    const reasons = generationStalenessReasons(
      snapshot(),
      snapshot({ generationPromptVersion: '2.2.0' }),
    )
    expect(reasons).toContain('generation-contract-changed')
  })

  test('detects generation model changes', () => {
    const reasons = generationStalenessReasons(snapshot(), snapshot({ resumeModel: 'gpt-5.7' }))
    expect(reasons).toContain('generation-model-changed')
  })

  test('detects Base Resume identity changes', () => {
    const reasons = generationStalenessReasons(
      snapshot({ baseResumeHash: 'hash-a', baseResumeVersion: 'v1' }),
      snapshot({ baseResumeHash: 'hash-b', baseResumeVersion: 'v2' }),
    )
    expect(reasons).toContain('base-resume-changed')
  })
})

describe('generation input identity migration', () => {
  test('adds input identity columns on an empty database', () => {
    const sqlite = migratedDatabase()
    try {
      const columns = sqlite.query("PRAGMA table_info('generation_runs')").all() as Array<{
        name: string
      }>
      const names = columns.map((column) => column.name)
      for (const column of [
        'input_hash',
        'frozen_input_json',
        'resume_model',
        'cover_letter_model',
        'prompt_version',
        'schema_version',
      ]) {
        expect(names).toContain(column)
      }
    } finally {
      sqlite.close()
    }
  })
})
