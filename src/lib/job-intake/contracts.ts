import { z } from 'zod'
import { isISODate } from '../date'

export const intakeLimits = {
  maxItems: 20,
  maxBodyBytes: 4 * 1024 * 1024,
  maxTextCharacters: 60_000,
  maxTextBytes: 128 * 1024,
} as const

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && !v.trim() ? null : v),
    z.string().trim().max(max).nullable().optional(),
  )
export const metadataFields = [
  'jobTitle',
  'companyName',
  'location',
  'postedDate',
  'salary',
] as const
export const identityPolicySchema = z
  .strictObject({
    version: z.literal(1),
    queryMode: z.enum(['keep-all', 'keep-listed']).default('keep-all'),
    queryParams: z.array(z.string().min(1).max(120)).max(30).default([]),
    dropQueryParams: z.array(z.string().min(1).max(120)).max(30).default([]),
    fragmentMode: z.enum(['keep', 'drop']).default('keep'),
  })
  .superRefine((v, ctx) => {
    if (v.queryParams.some((p) => v.dropQueryParams.includes(p)))
      ctx.addIssue({
        code: 'custom',
        message: 'Kept and dropped query parameters must not overlap.',
      })
  })
export const captureItemSchema = z.strictObject({
  clientItemId: z.uuid(),
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((s) => {
      const u = URL.parse(s)
      if (!u) return false
      return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
    }, 'Use an HTTP(S) URL without credentials.'),
  applicationSource: optionalText(150),
  rawText: z
    .string()
    .trim()
    .min(1)
    .max(intakeLimits.maxTextCharacters)
    .refine(
      (s) => new TextEncoder().encode(s).length <= intakeLimits.maxTextBytes,
      'Job text exceeds the byte limit.',
    )
    .refine(
      (s) => !/^\s*(?:<!doctype|<html|access denied\b|captcha\b)/i.test(s),
      'Supply job text, not an error page or HTML document.',
    ),
  suggestedMetadata: z
    .strictObject({
      jobTitle: optionalText(200),
      companyName: optionalText(200),
      location: optionalText(200),
      postedDate: z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().refine(isISODate, 'Use a real YYYY-MM-DD date.').nullable().optional(),
      ),
      salary: optionalText(150),
    })
    .optional(),
  capture: z
    .strictObject({
      capturedAt: z.iso.datetime({ offset: true }).optional(),
      ruleId: z.string().trim().max(120).optional(),
      ruleVersion: z.string().trim().max(100).optional(),
      fieldSources: z
        .partialRecord(
          z.enum(metadataFields),
          z.enum(['json-ld', 'css-selector', 'page-url', 'user']),
        )
        .optional(),
    })
    .optional(),
  identity: z
    .strictObject({
      providerJobId: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/^[\w.-]+$/)
        .optional(),
      policy: identityPolicySchema.optional(),
    })
    .optional(),
})
export const captureEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    clientBatchId: z.uuid(),
    items: z.array(z.unknown()).min(1).max(intakeLimits.maxItems),
  })
  .superRefine((v, ctx) => {
    const ids = v.items.map((item) =>
      item && typeof item === 'object' ? (item as Record<string, unknown>).clientItemId : undefined,
    )
    if (ids.some((id) => !z.uuid().safeParse(id).success) || new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Every item needs a distinct UUID clientItemId.',
      })
  })
export type CaptureItem = z.infer<typeof captureItemSchema>
export const pipelineStatuses = [
  'accepted',
  'queued',
  'processing',
  'completed',
  'duplicate',
  'failed',
  'rejected',
] as const
export type PipelineStatus = (typeof pipelineStatuses)[number]
export const terminalStatuses: readonly string[] = ['completed', 'duplicate', 'failed', 'rejected']

export class IntakeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503 = 422,
  ) {
    super(message)
  }
}
