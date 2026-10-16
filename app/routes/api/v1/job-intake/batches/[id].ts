import { createRoute } from 'honox/factory'
import { extensionBatchStatus } from '../../../../../../src/db/extension-intake'

export default createRoute((c) => {
  try {
    const id = Number(c.req.param('id'))
    const status = Number.isSafeInteger(id) && id > 0 ? extensionBatchStatus(id) : null
    if (!status)
      return c.json(
        {
          error: { code: 'batch-not-found', message: 'Batch not found.' },
          requestId: crypto.randomUUID(),
        },
        404,
      )
    c.header('Retry-After', status.isTerminal ? '0' : '30')
    return c.json(status)
  } catch {
    c.header('Retry-After', '30')
    return c.json(
      {
        error: { code: 'intake-unavailable', message: 'Batch status is temporarily unavailable.' },
        requestId: crypto.randomUUID(),
      },
      503,
    )
  }
})
