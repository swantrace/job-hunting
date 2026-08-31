import type { Context } from 'hono'
import { createRoute } from 'honox/factory'
import { updateSkillDetails } from '../../../src/db/queries'
import { listSkillsOverview } from '../../../src/db/resource-queries'
import { parseForm } from '../../../src/lib/request'
import { skillReviewStatuses } from '../../../src/lib/skills/constants'
import { hasSkillCategory } from '../../../src/lib/skills/taxonomy'
import { managedSkillSchema } from '../../../src/lib/validation'
import { FlashMessage } from '../../components/responses/FlashMessage'
import { SkillEditForm } from '../../components/skills/SkillEditForm'
import type { SkillFilters } from '../../components/skills/SkillsPage'
import { SkillsTable } from '../../components/skills/SkillsTable'

function filters(c: Context): SkillFilters {
  const category = c.req.query('category') ?? ''
  const status = c.req.query('status') ?? ''
  return {
    q: c.req.query('q')?.trim() ?? '',
    category: hasSkillCategory(category) ? category : '',
    status: (skillReviewStatuses as readonly string[]).includes(status) ? status : '',
  }
}

function selected(id: number) {
  return listSkillsOverview().find((skill) => skill.id === id)
}
function mergeTargets(id: number) {
  return listSkillsOverview().filter((skill) => skill.id !== id && skill.reviewStatus !== 'merged')
}
function results(value: SkillFilters) {
  return listSkillsOverview().filter(
    (skill) =>
      (!value.q || skill.name.toLowerCase().includes(value.q.toLowerCase())) &&
      (!value.category || skill.category === value.category) &&
      (!value.status || skill.reviewStatus === value.status),
  )
}

export const GET = createRoute((c) => {
  const skill = selected(Number(c.req.param('id')))
  return skill
    ? c.html(
        <SkillEditForm skill={skill} filters={filters(c)} mergeTargets={mergeTargets(skill.id)} />,
      )
    : c.text('Not found.', 404)
})

export const PUT = createRoute(async (c) => {
  const id = Number(c.req.param('id'))
  const skill = selected(id)
  if (!skill) return c.text('Not found.', 404)
  const currentFilters = filters(c)
  const parsed = managedSkillSchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <SkillEditForm
        skill={skill}
        filters={currentFilters}
        errors={parsed.error.flatten().fieldErrors}
        mergeTargets={mergeTargets(id)}
      />,
      422,
    )
  try {
    updateSkillDetails(id, parsed.data)
  } catch {
    return c.html(
      <SkillEditForm
        skill={skill}
        filters={currentFilters}
        errors={{ name: ['Unable to save this skill.'] }}
        mergeTargets={mergeTargets(id)}
      />,
      409,
    )
  }
  const updated = selected(id)
  if (!updated) return c.text('Not found.', 404)
  return c.html(
    <>
      <SkillEditForm skill={updated} filters={currentFilters} mergeTargets={mergeTargets(id)} />
      <SkillsTable skills={results(currentFilters)} filters={currentFilters} oob />
      <FlashMessage autoDismiss>Skill updated.</FlashMessage>
    </>,
  )
})
