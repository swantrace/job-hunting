import type { CareerDataGap, GapQueueFilters } from '../../../src/db/gap-queue'
import type { SkillOverview } from '../../../src/db/resource-queries'
import { AppShell } from '../layout/AppShell'
import { CareerDataGapQueue } from './CareerDataGapQueue'
import { SkillsTable } from './SkillsTable'
import { SkillWorkspace } from './SkillWorkspace'

export type SkillFilters = { q: string; category: string; status: string }

export function SkillsPage({
  skills,
  filters,
  gaps,
  gapFilters,
}: {
  skills: SkillOverview[]
  filters: SkillFilters
  gaps: CareerDataGap[]
  gapFilters: GapQueueFilters
}) {
  return (
    <AppShell title="Skills" currentPath="/skills">
      <SkillWorkspace>
        <SkillsTable skills={skills} filters={filters} />
        <CareerDataGapQueue gaps={gaps} filters={gapFilters} />
      </SkillWorkspace>
    </AppShell>
  )
}
