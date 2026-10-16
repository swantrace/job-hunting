import { bodyLimit } from 'hono/body-limit'
import { createRoute } from 'honox/factory'
import {
  acceptExtensionBatch,
  extensionBatchStatus,
} from '../../../../../../src/db/extension-intake'
import { IntakeError, intakeLimits } from '../../../../../../src/lib/job-intake/contracts'
import { dispatchExtensionIntake } from '../../../../../../src/lib/job-intake/extension-queue'

export const createBatchPost = (dispatch: () => Promise<unknown> = dispatchExtensionIntake) =>
  createRoute(
    bodyLimit({
      maxSize: intakeLimits.maxBodyBytes,
      onError: (c) =>
        c.json(
          {
            error: { code: 'body-too-large', message: 'Request exceeds 4 MiB.' },
            requestId: crypto.randomUUID(),
          },
          413,
        ),
    }),
    async (c) => {
      try {
        if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json'))
          throw new IntakeError('invalid-content-type', 'Use application/json.', 400)
        let body: unknown
        try {
          body = await c.req.json()
        } catch {
          throw new IntakeError('invalid-json', 'The request body is not valid JSON.', 400)
        }
        const result = acceptExtensionBatch(body, c.req.header('Idempotency-Key') ?? '')
        // Persisted accepted rows are the outbox; queue failure is recoverable.
        void dispatch().catch(() => undefined)
        return c.json(
          extensionBatchStatus(result.batchId),
          result.replayed ? 200 : result.allRejected ? 422 : 202,
        )
      } catch (error) {
        if (error instanceof IntakeError)
          return c.json(
            { error: { code: error.code, message: error.message }, requestId: crypto.randomUUID() },
            error.status,
          )
        console.error(
          'Intake API request failed',
          error instanceof Error ? error.name : 'UnknownError',
        )
        return c.json(
          {
            error: {
              code: 'intake-unavailable',
              message: 'Intake is temporarily unavailable. Retry with the same idempotency key.',
            },
            requestId: crypto.randomUUID(),
          },
          503,
        )
      }
    },
  )

export const POST = createBatchPost()
