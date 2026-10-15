import { metrics } from '../../../src/db/queries'
import { AppShell } from '../layout/AppShell'
import { Metrics } from './Dashboard'

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
