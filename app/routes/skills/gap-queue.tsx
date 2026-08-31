import { createRoute } from 'honox/factory'
import { type GapQueueFilters, listCareerDataGaps } from '../../../src/db/gap-queue'
import { skillDecisions } from '../../../src/lib/skills/constants'
import { hasSkillCategory } from '../../../src/lib/skills/taxonomy'
import { CareerDataGapQueue } from '../../components/skills/CareerDataGapQueue'

export default createRoute((c) => {
  const category = c.req.query('category') ?? ''
  const decision = c.req.query('decision') ?? ''
  const filters: GapQueueFilters = {
    category: hasSkillCategory(category) ? category : '',
    decision: (skillDecisions as readonly string[]).includes(decision) ? decision : '',
  }
  // Fragment-only response: never AppShell, sidebar, or a nested document.
  return c.html(<CareerDataGapQueue gaps={listCareerDataGaps(filters)} filters={filters} />)
})
