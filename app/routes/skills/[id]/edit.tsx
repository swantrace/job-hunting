import { createRoute } from 'honox/factory'
import { listSkillsOverview } from '../../../../src/db/resource-queries'
import { AppShell } from '../../../components/layout/AppShell'
import { SkillEditForm } from '../../../components/skills/SkillEditForm'

export default createRoute((c) => {
  const all = listSkillsOverview()
  const skill = all.find((s) => s.id === Number(c.req.param('id')))
  if (!skill) return c.text('Skill not found.', 404)
  if (skill.reviewStatus === 'merged' && skill.mergedIntoSkillId)
    return c.redirect(`/skills/${skill.mergedIntoSkillId}/edit`)
  return c.render(
    <AppShell title={`Manage skill · ${skill.name}`} currentPath="/skills">
      <a href="/skills" class="btn btn-ghost btn-sm mb-4">
        ← Back to skills
      </a>
      <div id="skill-workspace-panel">
        <SkillEditForm
          skill={skill}
          filters={{ q: '', category: '', status: '' }}
          mergeTargets={all.filter((s) => s.id !== skill.id && s.reviewStatus !== 'merged')}
        />
      </div>
    </AppShell>,
  )
})
