import { createRoute } from 'honox/factory'
import { createSkill, listManagementData, updateManagedItem } from '../../../src/db/queries'
import { parseForm } from '../../../src/lib/request'
import { skillSchema } from '../../../src/lib/validation'
import { ManagementContent } from '../../components/Management'

export const POST = createRoute(async (c) => {
  const form = await parseForm(c)
  const parsed = skillSchema.safeParse(form)
  if (!parsed.success)
    return c.html(
      <ManagementContent data={listManagementData()} error="Invalid skill." errorKind="skills" />,
      422,
    )
  const editId = Number(form.editId)
  if (Number.isSafeInteger(editId) && editId > 0) updateManagedItem('skills', editId, parsed.data)
  else createSkill(parsed.data.name)
  return c.html(<ManagementContent data={listManagementData()} />)
})
