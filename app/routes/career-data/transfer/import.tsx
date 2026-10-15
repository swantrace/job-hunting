import { createRoute } from 'honox/factory'
import { db } from '../../../../src/db/client'
import { CareerUploadError, decodeCareerUpload } from '../../../../src/lib/career/upload'
import { prepareCareerImport } from '../../../../src/lib/career-import'
import { retargetFragment } from '../../../../src/lib/request'
import { CareerImportForm, careerImportFormId } from '../../../components/career/CareerImportForm'
import { CareerImportPreviewPanel } from '../../../components/career/CareerImportPreview'

/**
 * Preview of an uploaded career source. The upload is decoded in memory and read
 * strictly as data: a failure returns the upload form with a 422 and an
 * actionable message, and a valid source returns a preview that binds the source
 * fingerprint and the database revision. Nothing is written here.
 *
 * The exact bytes are echoed back inside the confirm form so the confirm step can
 * re-read the same source and re-derive its fingerprint instead of trusting a
 * client-side hash.
 */
export const POST = createRoute(async (c) => {
  const form = await c.req.formData()
  const file = form.get('source')
  if (!(file instanceof File) || file.size === 0) {
    retargetFragment(c, careerImportFormId)
    return c.html(<CareerImportForm message="Choose a career dataset JSON or a legacy zip." />, 422)
  }
  const renderError = (message: string) => {
    retargetFragment(c, careerImportFormId)
    return c.html(<CareerImportForm message={message} />, 422)
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const decoded = decodeCareerUpload(file.name, bytes.buffer as ArrayBuffer)
    const source =
      decoded.kind === 'dataset'
        ? ({ kind: 'dataset', json: decoded.json } as const)
        : ({ kind: 'upload', files: decoded.files } as const)
    const preview = prepareCareerImport(db, source)
    return c.html(
      <CareerImportPreviewPanel
        preview={preview}
        payload={Buffer.from(bytes).toString('base64')}
      />,
    )
  } catch (error) {
    if (error instanceof CareerUploadError) return renderError(error.message)
    return renderError(
      `The upload could not be read as a career source: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
})
