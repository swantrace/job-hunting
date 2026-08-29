import type { BaselineGenerationRunWithArtifacts } from '../../src/db/generation'
import { AppShell } from './layout/AppShell'
import { BaselineGenerationPanel } from './BaselineGenerationPanel'

export function CareerDocumentsPage({ runs }: { runs: BaselineGenerationRunWithArtifacts[] }) {
  return (
    <AppShell title="Career documents" currentPath="/career-documents">
      <BaselineGenerationPanel runs={runs} />
    </AppShell>
  )
}
