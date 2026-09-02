import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonicalHash, canonicalSerialize } from '../../src/lib/canonical-hash'

/**
 * Versioned-workflow freshness contracts.
 *
 * The active `canonical hashing` suite protects the shared serialization
 * primitive every stage builds on. The remaining suites are conditional
 * contracts that become executable automatically when their boundary exists.
 *
 * Activation boundaries:
 * - `job analysis input hash`  -> `src/lib/job-analysis-input.ts` exists
 * - `candidate analysis input hash` -> `src/lib/candidate-analysis.ts` exports
 *   `getCandidateAnalysisState` (the Step 2.1 freshness correction)
 * - `documents input hash`     -> `src/lib/generation-input.ts` exists
 */
const root = process.cwd()
const jobAnalysisInputPath = resolve(root, 'src/lib/job-analysis-input.ts')
const generationInputPath = resolve(root, 'src/lib/generation-input.ts')
const candidateAnalysisPath = resolve(root, 'src/lib/candidate-analysis.ts')

function sourceHasExport(relativePath: string, exportName: string): boolean {
  try {
    return readFileSync(resolve(root, relativePath), 'utf8').includes(exportName)
  } catch {
    return false
  }
}

const jobAnalysisHashTest = existsSync(jobAnalysisInputPath) ? test : test.todo
const candidateHashTest = sourceHasExport(
  'src/lib/candidate-analysis.ts',
  'getCandidateAnalysisState',
)
  ? test
  : test.todo
const generationHashTest = existsSync(generationInputPath) ? test : test.todo

describe('canonical hashing', () => {
  test('is stable for semantically identical data regardless of key order', () => {
    const first = canonicalHash({ a: 1, nested: { b: 2, c: [3, 4] } })
    const second = canonicalHash({ nested: { c: [3, 4], b: 2 }, a: 1 })
    expect(first).toBe(second)
    expect(first).toHaveLength(64)
  })

  test('preserves array order as semantically significant', () => {
    expect(canonicalHash([1, 2, 3])).not.toBe(canonicalHash([3, 2, 1]))
  })

  test('produces different hashes for different values', () => {
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }))
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ b: 1 }))
  })

  test('normalizes undefined to null so absent and null fields match', () => {
    expect(canonicalHash({ a: null })).toBe(canonicalHash({ a: undefined }))
  })

  test('serializes nested arrays and objects deterministically', () => {
    expect(canonicalSerialize({ z: [1, { y: 2, x: 3 }], a: 'text' })).toBe(
      canonicalSerialize({ a: 'text', z: [1, { x: 3, y: 2 }] }),
    )
  })
})

describe('job analysis input hash', () => {
  const fixture = {
    contentHash: 'content-hash-a',
    taxonomyHash: 'taxonomy-hash-1',
    parserPromptVersion: '2.2.0',
    jobAnalysisPromptVersion: '3.0.0',
    jobAnalysisSchemaVersion: '3.0.0',
  }

  jobAnalysisHashTest('changes when the normalized raw post content changes', async () => {
    const { canonicalJobAnalysisInputHash } = await import(jobAnalysisInputPath)
    expect(canonicalJobAnalysisInputHash({ ...fixture, contentHash: 'content-hash-b' })).not.toBe(
      canonicalJobAnalysisInputHash(fixture),
    )
  })

  jobAnalysisHashTest('changes when the supplied skill-taxonomy content changes', async () => {
    const { canonicalJobAnalysisInputHash } = await import(jobAnalysisInputPath)
    expect(canonicalJobAnalysisInputHash({ ...fixture, taxonomyHash: 'taxonomy-hash-2' })).not.toBe(
      canonicalJobAnalysisInputHash(fixture),
    )
  })

  jobAnalysisHashTest('changes when the parser prompt version changes', async () => {
    const { canonicalJobAnalysisInputHash } = await import(jobAnalysisInputPath)
    expect(canonicalJobAnalysisInputHash({ ...fixture, parserPromptVersion: '2.3.0' })).not.toBe(
      canonicalJobAnalysisInputHash(fixture),
    )
  })

  jobAnalysisHashTest('changes when the job-analysis prompt version changes', async () => {
    const { canonicalJobAnalysisInputHash } = await import(jobAnalysisInputPath)
    expect(
      canonicalJobAnalysisInputHash({ ...fixture, jobAnalysisPromptVersion: '4.0.0' }),
    ).not.toBe(canonicalJobAnalysisInputHash(fixture))
  })

  jobAnalysisHashTest('changes when the job-analysis schema version changes', async () => {
    const { canonicalJobAnalysisInputHash } = await import(jobAnalysisInputPath)
    expect(
      canonicalJobAnalysisInputHash({ ...fixture, jobAnalysisSchemaVersion: '4.0.0' }),
    ).not.toBe(canonicalJobAnalysisInputHash(fixture))
  })
})

describe('candidate analysis input hash', () => {
  candidateHashTest('excludes skip/include decisions and reasons from the input', async () => {
    const { candidateAnalysisInputSchema } = await import(candidateAnalysisPath)
    const skillShape = candidateAnalysisInputSchema.shape.skillRequirements.element
    const keys = Object.keys(skillShape.shape ?? {})
    expect(keys).not.toContain('userDecision')
    expect(keys).not.toContain('decisionReason')
  })

  candidateHashTest('excludes profile selection from the input', async () => {
    const { candidateAnalysisInputSchema } = await import(candidateAnalysisPath)
    expect(Object.keys(candidateAnalysisInputSchema.shape)).not.toContain('confirmedProfileId')
    expect(Object.keys(candidateAnalysisInputSchema.shape)).not.toContain('profiles')
  })

  candidateHashTest('changes when the current job analysis changes', async () => {
    const { canonicalCandidateAnalysisInputHash } = await import(candidateAnalysisPath)
    const base = {
      jobAnalysisRunId: 1,
      jobAnalysisResult: 'result-a',
      requirements: [],
      careerData: 'career-a',
      evidence: 'evidence-a',
      candidateFitPromptVersion: '1.0.0',
      candidateFitSchemaVersion: '1.0.0',
    }
    expect(
      canonicalCandidateAnalysisInputHash({ ...base, jobAnalysisResult: 'result-b' }),
    ).not.toBe(canonicalCandidateAnalysisInputHash(base))
  })

  candidateHashTest('changes when career data changes', async () => {
    const { canonicalCandidateAnalysisInputHash } = await import(candidateAnalysisPath)
    const base = {
      jobAnalysisRunId: 1,
      jobAnalysisResult: 'result-a',
      requirements: [],
      careerData: 'career-a',
      evidence: 'evidence-a',
      candidateFitPromptVersion: '1.0.0',
      candidateFitSchemaVersion: '1.0.0',
    }
    expect(canonicalCandidateAnalysisInputHash({ ...base, careerData: 'career-b' })).not.toBe(
      canonicalCandidateAnalysisInputHash(base),
    )
  })
})

describe('documents input hash', () => {
  const fixture = {
    candidateAnalysisRunId: 1,
    candidateAnalysisInputHash: 'candidate-hash-a',
    direction: 'fullstack',
    decisions: [],
    reasons: [],
    evidenceHash: 'evidence-hash-a',
    generationPromptVersion: '2.1.0',
    generationSchemaVersion: '2.1.0',
    resumeModel: 'gpt-5.6-sol',
    coverLetterModel: 'gpt-5.6-terra',
  }

  generationHashTest('changes when the current candidate analysis changes', async () => {
    const { canonicalGenerationInputHash } = await import(generationInputPath)
    expect(
      canonicalGenerationInputHash({ ...fixture, candidateAnalysisInputHash: 'candidate-hash-b' }),
    ).not.toBe(canonicalGenerationInputHash(fixture))
  })

  generationHashTest('changes when the direction changes', async () => {
    const { canonicalGenerationInputHash } = await import(generationInputPath)
    expect(canonicalGenerationInputHash({ ...fixture, direction: 'frontend' })).not.toBe(
      canonicalGenerationInputHash(fixture),
    )
  })

  generationHashTest('changes when skip/include decisions change', async () => {
    const { canonicalGenerationInputHash } = await import(generationInputPath)
    expect(
      canonicalGenerationInputHash({ ...fixture, decisions: [{ skillId: 1, decision: 'skip' }] }),
    ).not.toBe(canonicalGenerationInputHash(fixture))
  })

  generationHashTest('changes when accepted include reasons change', async () => {
    const { canonicalGenerationInputHash } = await import(generationInputPath)
    expect(
      canonicalGenerationInputHash({
        ...fixture,
        reasons: [{ skillId: 1, reason: 'Used in a personal prototype.' }],
      }),
    ).not.toBe(canonicalGenerationInputHash(fixture))
  })

  generationHashTest('changes when the generation contract versions change', async () => {
    const { canonicalGenerationInputHash } = await import(generationInputPath)
    expect(canonicalGenerationInputHash({ ...fixture, generationPromptVersion: '2.2.0' })).not.toBe(
      canonicalGenerationInputHash(fixture),
    )
  })

  generationHashTest('changes when the configured generation models change', async () => {
    const { canonicalGenerationInputHash } = await import(generationInputPath)
    expect(canonicalGenerationInputHash({ ...fixture, resumeModel: 'gpt-5.7' })).not.toBe(
      canonicalGenerationInputHash(fixture),
    )
  })
})
