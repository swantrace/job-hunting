import type { CareerTransferOptions } from '../../../src/lib/career/transfer-options'
import { CareerDatasetExportForm } from './CareerDatasetExportForm'
import { CareerExportLimitsPanel } from './CareerExportLimitsPanel'
import { CareerImportForm, careerImportResultId } from './CareerImportForm'
import { ChatGptContextExportForm, ChatGptContextPreviewPanel } from './ChatGptContextExportForm'

/**
 * The Career data "Transfer" tab.
 *
 * Import and export of the logical career data live next to the career facts they
 * describe, inside the existing Career Data subnavigation, so no extra sidebar
 * item is added. Nothing here calls ChatGPT or any other service: the export is a
 * file the operator downloads and uses elsewhere.
 */
export function CareerTransferSection(options: CareerTransferOptions) {
  return (
    <div class="space-y-4">
      <CareerImportForm />
      <div id={careerImportResultId} aria-live="polite" />
      <ChatGptContextExportForm
        directions={options.directions}
        directionKey={options.contextDirectionKey}
        includeSourceUrls={options.includeSourceUrls}
        includeContactDetails={options.includeContactDetails}
      />
      <ChatGptContextPreviewPanel preview={options.contextPreview} error={options.contextError} />
      <CareerDatasetExportForm
        directions={options.directions}
        directionKey={options.datasetDirectionKey}
      />
      <CareerExportLimitsPanel contentFingerprint={options.contentFingerprint} />
    </div>
  )
}
