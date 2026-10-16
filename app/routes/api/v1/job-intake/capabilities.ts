import { createRoute } from 'honox/factory'
import { intakeLimits } from '../../../../../src/lib/job-intake/contracts'

export default createRoute((c) =>
  c.json({
    schemaVersion: 1,
    authenticated: true,
    limits: intakeLimits,
    pollingIntervalSeconds: 30,
    repeatImportBehavior: 'refresh-analysis',
  }),
)
