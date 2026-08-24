import { metrics } from '../../src/db/queries'
import { Metrics } from './Dashboard'
import { AppShell } from './layout/AppShell'

export function StatsDashboard() {
  return (
    <AppShell title="Dashboard" currentPath="/">
      <Metrics values={metrics()} />
      <div class="mt-6">
        <a href="/applications" class="btn btn-primary">
          View applications
        </a>
      </div>
    </AppShell>
  )
}
