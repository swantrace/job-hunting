import type { FieldErrors } from '../../../src/lib/validation'

/**
 * Feedback attached to a career form fragment: field errors from a 422, the
 * stale-revision state from a 409, or a form-level problem that has no field.
 */
export type CareerFormFeedback = {
  errors?: FieldErrors
  /** The record changed since the form was opened; the edit is refused. */
  conflict?: boolean
  /** Form-level message (for example a duplicate stable key). */
  message?: string
}
