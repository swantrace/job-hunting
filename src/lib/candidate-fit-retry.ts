import { z } from 'zod'
import { CandidateFitValidationError } from './fit-analysis'

/**
 * Bounded retries for candidate-fit output that fails its own contract. A
 * hallucinated evidence reference, a duplicate assessment, or a schema miss is
 * a fresh-sample problem, not an infrastructure problem: retrying the model
 * call on the same frozen input is the intended recovery. Network/HTTP errors
 * are deliberately not retried here — they bubble up to the queue's own
 * backoff/attempts so the two retry layers never multiply.
 */
export const candidateFitValidationMaxAttempts = 3

export async function retryCandidateFitOnValidationError<T>(
  attempt: () => Promise<T>,
  validate: (value: T) => T,
): Promise<T> {
  let lastError: unknown
  for (
    let attemptNumber = 1;
    attemptNumber <= candidateFitValidationMaxAttempts;
    attemptNumber += 1
  ) {
    try {
      return validate(await attempt())
    } catch (error) {
      const retriable = error instanceof CandidateFitValidationError || error instanceof z.ZodError
      if (!retriable) throw error
      lastError = error
    }
  }
  throw lastError
}
