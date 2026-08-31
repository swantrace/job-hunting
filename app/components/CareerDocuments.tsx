import type { BaselineGenerationRunWithArtifacts } from '../../src/db/generation'
import { BaselineGenerationPanel } from './BaselineGenerationPanel'
import { BaseResumeStatus } from './BaseResumeStatus'
import { AppShell } from './layout/AppShell'

export function CareerDocumentsPage({ runs }: { runs: BaselineGenerationRunWithArtifacts[] }) {
  return (
    <AppShell title="Career documents" currentPath="/career-documents">
      <div class="space-y-6">
        <BaseResumeStatus />
        <BaselineGenerationPanel runs={runs} />
      </div>
    </AppShell>
  )
}
