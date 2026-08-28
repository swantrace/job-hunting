import { createRoute } from 'honox/factory'
import { StatsDashboard } from '../components/StatsDashboard'

export default createRoute((c) => c.render(<StatsDashboard />))
