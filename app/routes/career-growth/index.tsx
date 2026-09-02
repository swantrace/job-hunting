import { createRoute } from 'honox/factory'
import { listCareerGrowthRows } from '../../../src/db/career-growth'
import { rankCareerGrowthOpportunities } from '../../../src/lib/career-growth'
import { listDirections } from '../../../src/lib/directions'
import { skillCategoryDefinitions } from '../../../src/lib/skills/taxonomy'
import { CareerGrowthList } from '../../components/CareerGrowth'
import { AppShell } from '../../components/layout/AppShell'

const MAX_ROWS = 200

function categoryFilter(value: string | undefined) {
  const categories = new Set(skillCategoryDefinitions().map((category) => category.key))
  return value && categories.has(value) ? value : undefined
}

function directionFilter(value: string | undefined) {
  return value && listDirections().some((direction) => direction.id === value) ? value : undefined
}

export default createRoute((c) => {
  const direction = directionFilter(c.req.query('direction'))
  const category = categoryFilter(c.req.query('category'))
  const rows = listCareerGrowthRows({ direction })
  const ranked = rankCareerGrowthOpportunities(rows).slice(0, MAX_ROWS)
  const opportunities = category ? ranked.filter((item) => item.category === category) : ranked
  const directions = listDirections()
  const categories = skillCategoryDefinitions()
  return c.render(
    <AppShell title="Career growth" currentPath="/career-growth">
      <div class="space-y-4">
        <form
          class="card border border-base-300 bg-base-100 shadow-sm"
          hx-get="/career-growth/list"
          hx-target="#career-growth-list"
          hx-swap="outerHTML"
          hx-trigger="change"
        >
          <div class="card-body">
            <div>
              <h2 class="card-title">Career growth</h2>
              <p class="text-sm text-base-content/60">
                Recurring evidence gaps across active applications, grouped by canonical skill.
                Ranked by application frequency, requirement importance, direction relevance, and
                retention. Include reasons are context only, never proof.
              </p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="form-control">
                <span class="label">
                  <span class="label-text">Direction</span>
                </span>
                <select name="direction" class="select select-bordered">
                  <option value="">All directions</option>
                  {directions.map((item) => (
                    <option value={item.id} selected={item.id === direction}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label class="form-control">
                <span class="label">
                  <span class="label-text">Category</span>
                </span>
                <select name="category" class="select select-bordered">
                  <option value="">All categories</option>
                  {categories.map((item) => (
                    <option value={item.key} selected={item.key === category}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </form>
        <CareerGrowthList opportunities={opportunities} />
      </div>
    </AppShell>,
  )
})
