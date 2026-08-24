import { createRoute } from 'honox/factory'
import { listBaselineGenerationRuns } from '../../../src/db/generation'
import { CareerDocumentsPage } from '../../components/CareerDocuments'

export default createRoute((c) =>
  c.render(<CareerDocumentsPage runs={listBaselineGenerationRuns()} />),
)
