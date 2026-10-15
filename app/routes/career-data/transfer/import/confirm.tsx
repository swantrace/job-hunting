import { createRoute } from 'honox/factory'
import { db } from '../../../../../src/db/client'
import { decodeCareerUpload } from '../../../../../src/lib/career/upload'
import { applyCareerImport, prepareCareerImport } from '../../../../../src/lib/career-import'
import { retargetFragment } from '../../../../../src/lib/request'
import { careerImportResultId } from '../../../../components/career/CareerImportForm'
import {
  CareerImportPreviewPanel,
  careerImportPreviewId,
} from '../../../../components/career/CareerImportPreview'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

/**
 * Confirm step for an uploaded career import.
 *
 * The uploaded bytes are re-read and re-decoded, then the source fingerprint and
 * the database revision are re-derived from scratch and compared with the values
 * the preview bound. A source whose bytes changed, a database that was written
 * between preview and confirm, and any conflict all abort with an actionable 422
 * and write nothing. Only an unchanged, conflict-free preview is applied, in one
 * transaction.
 */
export const POST = createRoute(async (c) => {
  const form = await c.req.formData()
  const payload = form.get('payload')
  const boundHash = form.get('sourceHash')
  if (typeof payload !== 'string' || typeof boundHash !== 'string') {
    return c.html(<div class="alert alert-error">Missing import preview data.</div>, 422)
  }
  const renderPreviewError = (message: string, conflicts: string[] = []) => {
    retargetFragment(c, careerImportPreviewId)
    return c.html(
      <section id={careerImportPreviewId} class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4">
          <h3 class="card-title text-base">Import preview expired</h3>
          <div class="alert alert-warning" role="alert">
            <div>
              <p class="font-semibold">{message}</p>
              {conflicts.length > 0 ? (
                <ul class="mt-1 list-disc ps-5 text-sm">
                  {conflicts.map((conflict) => (
                    <li>{conflict}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <p class="text-sm text-base-content/70">
            Nothing was written. Upload the source again and preview it before confirming.
          </p>
        </div>
      </section>,
      422,
    )
  }
  let source:
    | { kind: 'dataset'; json: unknown }
    | { kind: 'upload'; files: Record<string, string | null> }
  try {
    const bytes = Buffer.from(payload, 'base64')
    const decoded = decodeCareerUpload(
      '',
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    )
    source =
      decoded.kind === 'dataset'
        ? { kind: 'dataset', json: decoded.json }
        : { kind: 'upload', files: decoded.files }
  } catch (error) {
    return renderPreviewError(
      `The uploaded source could not be read again: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
  let preview: ReturnType<typeof prepareCareerImport>
  try {
    preview = prepareCareerImport(db, source)
  } catch (error) {
    return renderPreviewError(
      `The uploaded source is no longer valid: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    )
  }
  if (preview.sourceHash !== boundHash) {
    return renderPreviewError(
      'The import source changed since the preview was prepared, so the preview is stale.',
    )
  }
  if (preview.conflicts.length > 0) {
    return renderPreviewError(
      'The import is blocked by conflicts; nothing was written.',
      preview.conflicts,
    )
  }
  const report = applyCareerImport(db, preview)
  return c.html(
    <>
      <div id={careerImportPreviewId} />
      <div id={careerImportResultId}>
        <div class="alert alert-success" role="status">
          Import applied in one transaction: {report.inserted} inserted, {report.updated} updated,{' '}
          {report.unchanged} unchanged.
        </div>
      </div>
      <FlashMessage autoDismiss>Career data import applied.</FlashMessage>
    </>,
  )
})
