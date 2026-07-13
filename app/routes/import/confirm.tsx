import { createRoute } from 'honox/factory'
import { mergeImport } from '../../../src/db/queries'
import { importPayloadSchema } from '../../../src/lib/import'

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
  } catch {
    return c.html(<div class="alert alert-error">Import failed and was rolled back.</div>, 422)
  }
})
