import { createRoute } from 'honox/factory'
import { listJobIntakeBatches } from '../../../../src/db/job-intake'
import { JobIntakePanel } from '../../../components/JobIntake'

/** Fragment-only status poller for the batch intake list. */
export default createRoute((c) => c.html(<JobIntakePanel batches={listJobIntakeBatches()} />))
