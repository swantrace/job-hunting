import type { Filters } from '../../../src/db/queries'
import type { FieldErrors } from '../../../src/lib/validation'

export const query = (filters: Filters) => new URLSearchParams(filters).toString()
export const err = (errors: FieldErrors | undefined, key: string) => errors?.[key]?.[0]

export type WorkspaceErrorForm = 'contact' | 'follow-up' | 'interview'
