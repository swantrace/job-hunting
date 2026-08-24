import { metrics } from '../../src/db/queries'
import { Metrics } from './Dashboard'
import { AppShell } from './layout/AppShell'

export function StatsDashboard() {
  return (
    <AppShell title="Dashboard" currentPath="/">
      <Metrics values={metrics()} />
      <div class="mt-6 flex flex-wrap items-center gap-3">
        <a href="/applications" class="btn btn-primary">
          View applications
        </a>
        <label for="quick-collect-toggle" class="btn btn-outline">
          ➕ 快捷录入
        </label>
      </div>
    </AppShell>
  )
}
