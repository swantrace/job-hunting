import { z } from 'zod'
import { captureItemSchema, intakeLimits, pipelineStatuses } from './contracts'

const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: unknown) => ({ 'application/json': { schema } })
const response = (description: string, schema: unknown) => ({ description, content: json(schema) })
export const intakeOpenAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Job Tracker Extension Intake',
    version: '1.0.0',
    description:
      'Receives captured jobs and runs job/candidate analysis. Documents require a separate explicit user action.',
  },
  security: [{ intakeToken: [] }],
  paths: {
    '/api/v1/job-intake/capabilities': {
      get: {
        operationId: 'intakeCapabilities',
        responses: {
          '200': response('Configured and authenticated.', {
            type: 'object',
            properties: {
              schemaVersion: { const: 1 },
              authenticated: { const: true },
              limits: { type: 'object' },
              pollingIntervalSeconds: { type: 'integer' },
            },
          }),
          '401': response('Invalid token.', reference('Error')),
          '503': response('Token is not configured.', reference('Error')),
        },
      },
    },
    '/api/v1/job-intake/batches': {
      post: {
        operationId: 'submitJobBatch',
        description: `Maximum request ${intakeLimits.maxBodyBytes} bytes. Invalid items are rejected individually. Repeat exactly the same request/key after transport failures. Never fetches submitted URLs.`,
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 16, maxLength: 120, pattern: '^[\\w-]+$' },
          },
        ],
        requestBody: { required: true, content: json(reference('BatchRequest')) },
        responses: {
          '202': response('Persisted for asynchronous processing.', reference('BatchStatus')),
          '200': response('Identical idempotent replay.', reference('BatchStatus')),
          '400': response('Malformed JSON or content type.', reference('Error')),
          '401': response('Invalid token.', reference('Error')),
          '409': response(
            'Submission key/client batch ID was already used with a different request.',
            reference('Error'),
          ),
          '413': response('Request exceeds byte limit.', reference('Error')),
          '422': response(
            'Invalid envelope (Error), or all items rejected (BatchStatus with batchId).',
            { oneOf: [reference('Error'), reference('BatchStatus')] },
          ),
          '429': response(
            'Admission limit; obey Retry-After and reuse the same key.',
            reference('Error'),
          ),
          '503': response('Temporarily unavailable or not configured.', reference('Error')),
        },
      },
    },
    '/api/v1/job-intake/batches/{id}': {
      get: {
        operationId: 'getJobBatchStatus',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
        ],
        responses: {
          '200': response(
            'Candidate completion is terminal, regardless of pending user decisions.',
            reference('BatchStatus'),
          ),
          '401': response('Invalid token.', reference('Error')),
          '404': response('Unknown batch.', reference('Error')),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      intakeToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Dedicated JOB_INTAKE_API_TOKEN, not website Basic Auth or an OpenAI key.',
      },
    },
    schemas: {
      CaptureItem: z.toJSONSchema(captureItemSchema, { io: 'input', unrepresentable: 'any' }),
      BatchRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['schemaVersion', 'clientBatchId', 'items'],
        properties: {
          schemaVersion: { const: 1 },
          clientBatchId: { type: 'string', format: 'uuid' },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: intakeLimits.maxItems,
            items: reference('CaptureItem'),
          },
        },
      },
      ItemStatus: {
        type: 'object',
        required: ['clientItemId', 'itemId', 'status', 'stage', 'decisionCount'],
        properties: {
          clientItemId: { type: 'string', format: 'uuid' },
          itemId: { type: 'integer' },
          status: { type: 'string', enum: pipelineStatuses },
          stage: {
            type: 'string',
            enum: ['intake', 'job-analysis', 'skill-resolution', 'candidate-analysis', 'done'],
          },
          jobAnalysisRunId: { type: ['integer', 'null'] },
          candidateAnalysisRunId: { type: ['integer', 'null'] },
          applicationUrl: { type: ['string', 'null'] },
          decisionCount: { type: 'integer' },
          metadataConflictCount: { type: 'integer' },
          retryable: { type: 'boolean' },
          error: {
            type: ['object', 'null'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fieldErrors: { type: 'object' },
            },
          },
        },
      },
      BatchStatus: {
        type: 'object',
        required: [
          'schemaVersion',
          'batchId',
          'status',
          'revision',
          'isTerminal',
          'terminalRevision',
          'counts',
          'total',
          'items',
        ],
        properties: {
          schemaVersion: { const: 1 },
          batchId: { type: 'integer' },
          status: { type: 'string', enum: ['processing', 'completed', 'completed-with-errors'] },
          revision: { type: 'integer' },
          terminalRevision: {
            type: ['string', 'null'],
            description:
              'Stable first terminal event ID. Later manual reruns do not emit another import completion.',
          },
          isTerminal: { type: 'boolean' },
          total: { type: 'integer' },
          counts: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
          decisionCount: { type: 'integer' },
          statusUrl: { type: 'string' },
          reviewUrl: { type: 'string' },
          items: { type: 'array', items: reference('ItemStatus') },
        },
      },
      Error: {
        type: 'object',
        required: ['error', 'requestId'],
        properties: {
          requestId: { type: 'string' },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fieldErrors: { type: 'object' },
            },
          },
        },
      },
    },
  },
} as const
