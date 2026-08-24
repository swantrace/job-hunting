import { createRoute } from 'honox/factory'
import { listBaselineGenerationRuns } from '../../../src/db/generation'
import { enqueueBaselineGeneration } from '../../../src/lib/generation-queue'
import { listProfiles } from '../../../src/lib/profiles'
import { parseForm } from '../../../src/lib/request'
import { baselineGenerationSchema } from '../../../src/lib/validation'
import { BaselineGenerationPanel } from '../../components/CareerDocuments'

export default createRoute((c) =>
  c.html(<BaselineGenerationPanel runs={listBaselineGenerationRuns()} />),
)

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
  const keywords = (parsed.data.targetKeywords ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
  const profile = listProfiles().find((item) => item.id === parsed.data.direction)
  await enqueueBaselineGeneration({
    direction: parsed.data.direction,
    targetTitle: parsed.data.targetTitle ?? profile?.label ?? parsed.data.direction,
    targetKeywords: [...new Set(keywords)],
  })
  return c.html(<BaselineGenerationPanel runs={listBaselineGenerationRuns()} />)
})
