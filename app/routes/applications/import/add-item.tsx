import { createRoute } from 'honox/factory'
import { JobIntakeField } from '../../../components/JobIntake'

/** Appends one more job-post field to the intake form (HTMX fragment). */
export const POST = createRoute((c) => c.html(<JobIntakeField />))
