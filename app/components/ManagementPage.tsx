import type { listManagementData } from '../../src/db/queries'
import { AppShell } from './layout/AppShell'
import { ManagementContent } from './Management'

export function ManagementPage({ data }: { data: ReturnType<typeof listManagementData> }) {
  return (
    <AppShell title="Manage data" currentPath="/manage">
      <ManagementContent data={data} />
    </AppShell>
  )
}
