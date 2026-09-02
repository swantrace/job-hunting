import { createRoute } from 'honox/factory'
import { listBaselineGenerationRuns } from '../../../src/db/generation'
import { baseResumesDirectory, loadApprovedBaseResume } from '../../../src/lib/base-resumes'
import { directionLabel, listDirections } from '../../../src/lib/directions'
import { enqueueBaselineGeneration } from '../../../src/lib/generation-queue'
import { parseForm } from '../../../src/lib/request'
import { baselineGenerationSchema } from '../../../src/lib/validation'
import { BaselineGenerationPanel } from '../../components/BaselineGenerationPanel'

export default createRoute((c) =>
  c.html(<BaselineGenerationPanel runs={listBaselineGenerationRuns()} />),
)

function approvedBaseResumeError(direction: string): string | null {
  try {
    const resume = loadApprovedBaseResume(
      baseResumesDirectory(),
      direction,
      new Set(listDirections().map((item) => item.id)),
    )
    return resume
      ? null
      : `No approved Base Resume for direction "${direction}". Import one before generating a baseline.`
  } catch (error) {
    return error instanceof Error ? error.message : 'Base Resume is unavailable.'
  }
}

export const POST = createRoute(async (c) => {
  const parsed = baselineGenerationSchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <BaselineGenerationPanel
        runs={listBaselineGenerationRuns()}
        error={parsed.error.issues.map((issue) => issue.message).join(' ')}
      />,
      422,
    )
  const baseError = approvedBaseResumeError(parsed.data.direction)
  if (baseError)
    return c.html(
      <BaselineGenerationPanel runs={listBaselineGenerationRuns()} error={baseError} />,
      422,
    )
  const keywords = (parsed.data.targetKeywords ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
  await enqueueBaselineGeneration({
    direction: parsed.data.direction,
    targetTitle:
      parsed.data.targetTitle ?? directionLabel(parsed.data.direction) ?? parsed.data.direction,
    targetKeywords: [...new Set(keywords)],
  })
  return c.html(<BaselineGenerationPanel runs={listBaselineGenerationRuns()} />)
})
