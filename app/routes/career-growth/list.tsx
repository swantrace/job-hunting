import { createRoute } from 'honox/factory'
import { listCareerGrowthRows } from '../../../src/db/career-growth'
import { rankCareerGrowthOpportunities } from '../../../src/lib/career-growth'
import { listDirections } from '../../../src/lib/directions'
import { skillCategoryDefinitions } from '../../../src/lib/skills/taxonomy'
import { CareerGrowthList } from '../../components/CareerGrowth'

const MAX_ROWS = 200

/** Fragment-only filtered list update. Never emits an AppShell. */
export default createRoute((c) => {
  const direction = c.req.query('direction')
  const category = c.req.query('category')
  const directions = new Set(listDirections().map((item) => item.id))
  const categories = new Set(skillCategoryDefinitions().map((item) => item.key))
  const rows = listCareerGrowthRows({
    direction: direction && directions.has(direction) ? direction : undefined,
  })
  const ranked = rankCareerGrowthOpportunities(rows).slice(0, MAX_ROWS)
  const opportunities =
    category && categories.has(category)
      ? ranked.filter((item) => item.category === category)
      : ranked
  return c.html(<CareerGrowthList opportunities={opportunities} />)
})
