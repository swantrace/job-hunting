import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { retryCandidateFitOnValidationError } from '../../src/lib/candidate-fit-retry'
import { CandidateFitValidationError } from '../../src/lib/fit-analysis'

describe('candidate-fit validation retry', () => {
  test('retries a hallucinated evidence reference and returns the first valid sample', async () => {
    let calls = 0
    const result = await retryCandidateFitOnValidationError(
      async () => {
        calls += 1
        return { id: calls }
      },
      (value) => {
        // Simulates an ineligible evidence ID on the first two samples.
        if (value.id < 3) throw new CandidateFitValidationError('Unknown evidence ID.')
        return value
      },
    )

    expect(result.id).toBe(3)
    expect(calls).toBe(3)
  })

  test('retries schema validation misses too', async () => {
    let calls = 0
    const result = await retryCandidateFitOnValidationError(
      async () => {
        calls += 1
        return { id: calls }
      },
      (value) => {
        if (value.id < 2) throw new z.ZodError([])
        return value
      },
    )

    expect(result.id).toBe(2)
    expect(calls).toBe(2)
  })

  test('does not retry non-validation errors such as network failures', async () => {
    let calls = 0
    await expect(
      retryCandidateFitOnValidationError(
        async () => {
          calls += 1
          throw new Error('network down')
        },
        (value) => value,
      ),
    ).rejects.toThrow('network down')
    expect(calls).toBe(1)
  })

  test('gives up after the bounded attempts and surfaces the last validation error', async () => {
    let calls = 0
    await expect(
      retryCandidateFitOnValidationError(
        async () => {
          calls += 1
          return { id: calls }
        },
        () => {
          throw new CandidateFitValidationError('still unverifiable')
        },
      ),
    ).rejects.toThrow('still unverifiable')
    expect(calls).toBe(3)
  })
})
