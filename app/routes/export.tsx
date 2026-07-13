import { createRoute } from 'honox/factory'
import { exportData } from '../../src/db/queries'

export default createRoute(() => {
  const body = JSON.stringify(exportData(), null, 2)
  const filename = `job-applications-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})
