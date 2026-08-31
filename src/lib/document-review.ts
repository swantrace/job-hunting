import { createHash } from 'node:crypto'
import {
  documentReviewPromptVersion,
  documentReviewSystemPrompt,
} from '../ai/prompts/document-review'
import {
  type DocumentReview as DocumentReviewResult,
  documentReviewResponseSchema,
  documentReviewSchema,
} from '../ai/schemas/document-review'
import { getDocumentReview } from '../db/document-review'
import {
  getGenerationEvidenceSnapshot,
  getGenerationRun,
  getGenerationRunResults,
} from '../db/generation'

type JsonSchema = Record<string, unknown>

function buildDocumentReviewInput(generationRunId: number) {
  const run = getGenerationRun(generationRunId)
  if (!run || run.status !== 'Completed') return null
  const results = getGenerationRunResults(generationRunId)
  if (!results?.resumeMarkdown || !results?.coverLetterMarkdown) return null
  const evidence = getGenerationEvidenceSnapshot(generationRunId)
  return {
    generationRunId,
    resumeMarkdown: results.resumeMarkdown,
    coverLetterMarkdown: results.coverLetterMarkdown,
    draftValidation: results.draftValidationJson ? JSON.parse(results.draftValidationJson) : null,
    evidenceSnapshot: evidence ? JSON.parse(evidence.snapshotJson) : null,
  }
}

export function documentReviewInputHash(generationRunId: number) {
  const input = buildDocumentReviewInput(generationRunId)
  if (!input) return null
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export async function runDocumentReview(reviewId: number): Promise<DocumentReviewResult> {
  const review = getDocumentReview(reviewId)
  if (!review) throw new Error('Document review no longer exists.')
  const input = buildDocumentReviewInput(review.generationRunId)
  if (!input) throw new Error('Completed generation results are missing.')

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model:
        process.env.OPENAI_MODEL_DOCUMENT_REVIEW ??
        process.env.OPENAI_MODEL_DEFAULT ??
        'gpt-5.6-terra',
      input: [
        {
          role: 'system',
          content: `${documentReviewSystemPrompt}\nPrompt version: ${documentReviewPromptVersion}`,
        },
        { role: 'user', content: JSON.stringify(input) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'document_review',
          strict: true,
          schema: documentReviewResponseSchema as unknown as JsonSchema,
        },
      },
    }),
  })
  if (!response.ok)
    throw new Error(
      `OpenAI document review request failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
    )
  const body = (await response.json()) as {
    output_text?: string
    output?: { content?: { text?: string }[] }[]
  }
  const output =
    body.output_text ??
    body.output?.flatMap((item) => item.content ?? []).find((part) => part.text)?.text
  if (!output) throw new Error('OpenAI returned no document review content.')
  return documentReviewSchema.parse(JSON.parse(output))
}
