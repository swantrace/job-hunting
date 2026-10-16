import { z } from 'zod'

export const batchAnalysisModes = ['job-and-candidate', 'candidate-only'] as const
export const batchAnalysisStatuses = [
  'queued',
  'job-analysis',
  'candidate-analysis',
  'completed',
  'failed',
  'skipped',
] as const
export const batchAnalysisRequestSchema = z.object({
  mode: z.enum(batchAnalysisModes),
  applicationIds: z
    .array(z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .min(1)
    .max(200),
})
