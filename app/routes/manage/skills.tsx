import { createRoute } from 'honox/factory'
import { createSkill, listManagementData } from '../../../src/db/queries'
import { parseForm } from '../../../src/lib/request'
import { skillSchema } from '../../../src/lib/validation'
import { ManagementContent } from '../../components/Management'

export const POST = createRoute(async (c) => {
  const parsed = skillSchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid skill.
      </div>,
      422,
    )
  createSkill(parsed.data.name)
  return c.html(<ManagementContent data={listManagementData()} />)
})
