import { createRoute } from 'honox/factory'
import { createTag, listManagementData } from '../../../src/db/queries'
import { parseForm } from '../../../src/lib/request'
import { tagSchema } from '../../../src/lib/validation'
import { ManagementContent } from '../../components/Management'

export const POST = createRoute(async (c) => {
  const parsed = tagSchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid tag.
      </div>,
      422,
    )
  createTag(parsed.data.name)
  return c.html(<ManagementContent data={listManagementData()} />)
})
