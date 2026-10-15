import { createRoute } from 'honox/factory'
import { db } from '../../../../../src/db/client'
import {
  contextPreviewFor,
  parseCareerTransferQuery,
} from '../../../../../src/lib/career/transfer-options'
import { ChatGptContextPreviewPanel } from '../../../../components/career/ChatGptContextExportForm'

/** Preview fragment for the ChatGPT context scope and privacy controls. */
export const GET = createRoute((c) => {
  const query = parseCareerTransferQuery((name) => c.req.query(name))
  const { preview, error } = contextPreviewFor(db, query)
  return c.html(<ChatGptContextPreviewPanel preview={preview} error={error} />)
})
