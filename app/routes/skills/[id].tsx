import type { Context } from 'hono'
import { createRoute } from 'honox/factory'
import { deleteManagedItem, updateSkillDetails } from '../../../src/db/queries'
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
  if (skill?.mergedIntoSkillId) return c.redirect(`/skills/${skill.mergedIntoSkillId}`)
  return skill
    ? c.html(
        <SkillEditForm skill={skill} filters={filters(c)} mergeTargets={mergeTargets(skill.id)} />,
      )
    : c.text('Not found.', 404)
})

export const DELETE = createRoute((c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1 || !selected(id)) return c.text('Not found.', 404)
  const deleted = deleteManagedItem('skills', id)
  const currentFilters = filters(c)
  return c.html(
    <>
      <SkillsTable skills={results(currentFilters)} filters={currentFilters} />
      <FlashMessage tone={deleted ? 'success' : 'warning'} autoDismiss={deleted}>
        {deleted
          ? 'Skill deleted. Original job terms were kept as skipped; related review decisions and aliases were removed.'
          : 'This skill is referenced by personal career data or incoming merge redirects. Use merge for duplicates, or remove its personal references first.'}
      </FlashMessage>
    </>,
    deleted ? 200 : 409,
  )
})

export const PUT = createRoute(async (c) => {
  const id = Number(c.req.param('id'))
  const skill = selected(id)
  if (!skill) return c.text('Not found.', 404)
  const currentFilters = filters(c)
  const form = await parseForm(c)
  const submitted = {
    ...skill,
    name: String(form.name ?? ''),
    category: String(form.category ?? '') || null,
    reviewStatus:
      skillReviewStatuses.find((status) => status !== 'merged' && status === form.reviewStatus) ??
      skill.reviewStatus,
  }
  const aliases = typeof form.aliases === 'string' ? form.aliases : undefined
  const parsed = managedSkillSchema.safeParse(form)
  if (!parsed.success)
    return c.html(
      <SkillEditForm
        skill={submitted}
        aliases={aliases}
        filters={currentFilters}
        errors={parsed.error.flatten().fieldErrors}
        mergeTargets={mergeTargets(id)}
      />,
      422,
    )
  try {
    updateSkillDetails(id, parsed.data)
  } catch (error) {
    return c.html(
      <SkillEditForm
        skill={{ ...submitted, reviewStatus: parsed.data.reviewStatus }}
        aliases={aliases}
        filters={currentFilters}
        errors={{
          aliases: [error instanceof Error ? error.message : 'Unable to save this skill.'],
        }}
        mergeTargets={mergeTargets(id)}
      />,
      422,
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
