import { createRoute } from 'honox/factory'
import { listSkillsOverview } from '../../../src/db/resource-queries'
import { skillReviewStatuses } from '../../../src/lib/skills/constants'
import { hasSkillCategory } from '../../../src/lib/skills/taxonomy'
import { type SkillFilters, SkillsPage } from '../../components/skills/SkillsPage'
import { SkillsTable } from '../../components/skills/SkillsTable'

export default createRoute((c) => {
  const q = c.req.query('q')?.trim() ?? ''
  const category = c.req.query('category') ?? ''
  const status = c.req.query('status') ?? ''
  const filters: SkillFilters = {
    q,
    category: hasSkillCategory(category) ? category : '',
    status: (skillReviewStatuses as readonly string[]).includes(status) ? status : '',
  }
  const skills = listSkillsOverview().filter((skill) => {
    if (filters.q && !skill.name.toLowerCase().includes(filters.q.toLowerCase())) return false
    if (filters.category && skill.category !== filters.category) return false
    if (filters.status && skill.reviewStatus !== filters.status) return false
    return true
  })
  if (c.req.header('HX-Request') === 'true')
    return c.html(<SkillsTable skills={skills} filters={filters} />)
  return c.render(<SkillsPage skills={skills} filters={filters} />)
})
