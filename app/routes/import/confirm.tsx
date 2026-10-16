import { createRoute } from 'honox/factory'
import { mergeImport } from '../../../src/db/queries'
import { importPayloadSchema } from '../../../src/lib/job-intake/import'

export const POST = createRoute(async (c) => {
  const form = await c.req.formData()
  const raw = form.get('payload')
  if (typeof raw !== 'string')
    return c.html(<div class="alert alert-error">Missing import payload.</div>, 422)
  try {
    const parsed = importPayloadSchema.safeParse(JSON.parse(raw))
    if (!parsed.success)
      return c.html(<div class="alert alert-error">Invalid import payload.</div>, 422)
    mergeImport(parsed.data)
    return c.html(<div class="alert alert-success">Import completed successfully.</div>)
  } catch (error) {
    return c.html(
      <div role="alert" class="alert alert-error">
        Import failed and was rolled back. {error instanceof Error ? error.message : ''}
      </div>,
      422,
    )
  }
})
