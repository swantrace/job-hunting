import type { Context } from 'hono'
import { createRoute } from 'honox/factory'
import { listSkillsOverview } from '../../../../src/db/resource-queries'
import { mergeSkills } from '../../../../src/db/skill-service'
import { parseForm } from '../../../../src/lib/request'
import { skillReviewStatuses } from '../../../../src/lib/skills/constants'
import { hasSkillCategory } from '../../../../src/lib/skills/taxonomy'
import { FlashMessage } from '../../../components/responses/FlashMessage'
import { SkillEditForm } from '../../../components/skills/SkillEditForm'
import type { SkillFilters } from '../../../components/skills/SkillsPage'
import { SkillsTable } from '../../../components/skills/SkillsTable'

function filters(c: Context): SkillFilters {
  const category = c.req.query('category') ?? ''
  const status = c.req.query('status') ?? ''
  return {
    q: c.req.query('q')?.trim() ?? '',
    category: hasSkillCategory(category) ? category : '',
    status: (skillReviewStatuses as readonly string[]).includes(status) ? status : '',
  }
}

function results(value: SkillFilters) {
  return listSkillsOverview().filter(
    (skill) =>
      (!value.q || skill.name.toLowerCase().includes(value.q.toLowerCase())) &&
      (!value.category || skill.category === value.category) &&
      (!value.status || skill.reviewStatus === value.status),
  )
}

export const POST = createRoute(async (c) => {
  const sourceId = Number(c.req.param('id'))
  const all = listSkillsOverview()
  const source = all.find((skill) => skill.id === sourceId)
  if (!source) return c.text('Not found.', 404)
  const currentFilters = filters(c)
  const targets = all.filter((skill) => skill.id !== sourceId && skill.reviewStatus !== 'merged')
  const form = await parseForm(c)
  const targetId = Number(form.targetSkillId)
  const target = targets.find((skill) => skill.id === targetId)
  if (!target)
    return c.html(
      <SkillEditForm
        skill={source}
        filters={currentFilters}
        mergeTargets={targets}
        mergeError="Choose a valid target skill."
      />,
      422,
    )
  try {
    mergeSkills(sourceId, targetId)
  } catch (error) {
    return c.html(
      <SkillEditForm
        skill={source}
        filters={currentFilters}
        mergeTargets={targets}
        mergeError={error instanceof Error ? error.message : 'Unable to merge these skills.'}
      />,
      409,
    )
  }
  const updated = listSkillsOverview()
  const mergedTarget = updated.find((skill) => skill.id === targetId)
  if (!mergedTarget) return c.text('Not found.', 404)
  return c.html(
    <>
      <SkillEditForm
        skill={mergedTarget}
        filters={currentFilters}
        mergeTargets={updated.filter(
          (skill) => skill.id !== targetId && skill.reviewStatus !== 'merged',
        )}
      />
      <SkillsTable skills={results(currentFilters)} filters={currentFilters} oob />
      <FlashMessage autoDismiss>Skills merged.</FlashMessage>
    </>,
  )
})
