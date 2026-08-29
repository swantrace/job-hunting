import type { BaselineGenerationRunWithArtifacts } from '../../src/db/generation'
import { BaselineGenerationPanel } from './BaselineGenerationPanel'
import { AppShell } from './layout/AppShell'

export function CareerDocumentsPage({ runs }: { runs: BaselineGenerationRunWithArtifacts[] }) {
  return (
    <AppShell title="Career documents" currentPath="/career-documents">
      <BaselineGenerationPanel runs={runs} />
    </AppShell>
  )
}
