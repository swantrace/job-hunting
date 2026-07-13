import { createRoute } from 'honox/factory'
import { listManagementData } from '../../../src/db/queries'
import { ManagementPage } from '../../components/Management'

export default createRoute((c) => c.render(<ManagementPage data={listManagementData()} />))
