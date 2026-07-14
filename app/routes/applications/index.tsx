import { createRoute } from 'honox/factory'
import { createApplication, listApplications, metrics } from '../../../src/db/queries'
import { enqueueGeneration } from '../../../src/lib/generation-queue'
import { parseFilters, parseForm } from '../../../src/lib/request'
import { quickCollectSchema } from '../../../src/lib/validation'
import { Board, QuickCollect } from '../../components/Dashboard'
import { MutationResponse } from '../../components/Responses'

export const GET = createRoute((c) => {
  const filters = parseFilters(c)
  return c.html(<Board jobs={listApplications(filters)} filters={filters} />)
})

export const POST = createRoute(async (c) => {
  const filters = parseFilters(c)
  const raw = await parseForm(c)
  const parsed = quickCollectSchema.safeParse(raw)
  if (!parsed.success)
    return c.html(
      <QuickCollect
        filters={filters}
        errors={parsed.error.flatten().fieldErrors}
        values={raw as Record<string, string>}
      />,
      422,
    )
  const id = createApplication(parsed.data)
  if (parsed.data.parserPromptVersion) {
    try {
      await enqueueGeneration(id)
    } catch (error) {
      // The saved run remains Queued and will be recovered on the next server start.
      console.error('Unable to enqueue document generation', error)
    }
  }
  return c.html(
    <MutationResponse
      jobs={listApplications(filters)}
      filters={filters}
      values={metrics()}
      resetQuick
    />,
  )
})
