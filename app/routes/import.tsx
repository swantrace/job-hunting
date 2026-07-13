import { createRoute } from 'honox/factory'
import { previewImport } from '../../src/db/queries'
import { importPayloadSchema } from '../../src/lib/import'
import { ImportPage, ImportPreview } from '../components/Import'

export const POST = createRoute(async (c) => {
  const form = await c.req.formData()
  const file = form.get('backup')
  if (!(file instanceof File))
    return c.html(<div class="alert alert-error">Choose a JSON file.</div>, 422)
  try {
    const parsed = importPayloadSchema.safeParse(JSON.parse(await file.text()))
    if (!parsed.success)
      return c.html(<div class="alert alert-error">Invalid backup format.</div>, 422)
    return c.html(
      <ImportPreview preview={previewImport(parsed.data)} payload={JSON.stringify(parsed.data)} />,
    )
  } catch {
    return c.html(<div class="alert alert-error">The file is not valid JSON.</div>, 422)
  }
})

export default createRoute((c) => c.render(<ImportPage />))
