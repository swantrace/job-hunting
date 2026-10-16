import { createRoute } from 'honox/factory'
import { StatsDashboard } from '../components/dashboard/StatsDashboard'

export default createRoute((c) => c.render(<StatsDashboard />))
