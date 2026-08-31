import { createRoute } from 'honox/factory'
import {
  createJobIntakeBatch,
  createJobIntakeItems,
  listJobIntakeBatches,
} from '../../../src/db/job-intake'
import { parseBatchIntake } from '../../../src/lib/batch-intake'
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
  const form = await c.req.formData()
  const input = String(form.get('input') ?? '')
  let items
  try {
    items = parseBatchIntake(input)
  } catch (error) {
    return c.html(
      <JobIntakePanel
        batches={listJobIntakeBatches()}
        error={error instanceof Error ? error.message : 'Unable to parse the import.'}
      />,
      422,
    )
  }
  if (!items.length)
    return c.html(
      <JobIntakePanel
        batches={listJobIntakeBatches()}
        error="Paste at least one URL or job description."
      />,
      422,
    )
  const batch = createJobIntakeBatch()
  createJobIntakeItems(
    batch.id,
    items.map((item, position) => ({
      sequence: position + 1,
      kind: item.kind,
      raw: item.raw,
      normalizedUrl: item.url,
      status:
        item.state === 'needs-pasted-text' ? ('needs-pasted-text' as const) : ('pending' as const),
      errorMessage: item.reason,
    })),
  )
  enqueueJobIntakeBatch(batch.id)
  return c.html(<JobIntakePanel batches={listJobIntakeBatches()} />)
})
