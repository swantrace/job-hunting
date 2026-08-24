import { createRoute } from 'honox/factory'
import { parseFilters } from '../../src/lib/request'
import { DashboardPage } from '../components/DashboardPage'

export default createRoute((c) => c.render(<DashboardPage filters={parseFilters(c)} />))
