import type { SkillOverview } from '../../../src/db/resource-queries'
import { AppShell } from '../layout/AppShell'
import { SkillsTable } from './SkillsTable'
import { SkillWorkspace } from './SkillWorkspace'

export type SkillFilters = { q: string; category: string; status: string }

export function SkillsPage({
  skills,
  filters,
}: {
  skills: SkillOverview[]
  filters: SkillFilters
}) {
  return (
    <AppShell title="Skills" currentPath="/skills">
      <SkillWorkspace>
        <SkillsTable skills={skills} filters={filters} />
      </SkillWorkspace>
    </AppShell>
  )
}
