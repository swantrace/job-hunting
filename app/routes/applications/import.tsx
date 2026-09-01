import { createRoute } from 'honox/factory'
import {
  createJobIntakeBatch,
  createJobIntakeItems,
  listJobIntakeBatches,
} from '../../../src/db/job-intake'
import { classifyIntakeField, validateIntakeUrl } from '../../../src/lib/batch-intake'
import { enqueueJobIntakeBatch } from '../../../src/lib/job-intake-queue'
import { JobIntakePanel } from '../../components/JobIntake'
import { AppShell } from '../../components/layout/AppShell'

export default createRoute((c) =>
  c.render(
    <AppShell title="Import job posts" currentPath="/applications/import">
      <JobIntakePanel batches={listJobIntakeBatches()} />
    </AppShell>,
  ),
)

export const POST = createRoute(async (c) => {
  const fields = (await c.req.formData())
    .getAll('items')
    .map((value) => String(value).trim())
    .filter((value) => value !== '')
  if (!fields.length)
    return c.html(
      <JobIntakePanel
        batches={listJobIntakeBatches()}
        error="Paste at least one job description or URL."
      />,
      422,
    )

  const items = fields.map((field, position) => {
    const kind = classifyIntakeField(field)
    if (kind === 'url') {
      const safety = validateIntakeUrl(field)
      return {
        sequence: position + 1,
        kind,
        raw: field,
        normalizedUrl: field,
        status: safety.ok ? ('pending' as const) : ('needs-pasted-text' as const),
        errorMessage: safety.ok ? null : (safety.reason ?? null),
      }
    }
    return {
      sequence: position + 1,
      kind,
      raw: field,
      normalizedUrl: null,
      status: 'pending' as const,
      errorMessage: null,
    }
  })

  const batch = createJobIntakeBatch()
  createJobIntakeItems(batch.id, items)
  enqueueJobIntakeBatch(batch.id)
  return c.html(<JobIntakePanel batches={listJobIntakeBatches()} />)
})
