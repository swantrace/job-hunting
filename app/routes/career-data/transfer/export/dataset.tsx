import { createRoute } from 'honox/factory'
import { db } from '../../../../../src/db/client'
import { buildCareerDataset, serializeCareerDataset } from '../../../../../src/lib/career/export'

/**
 * Portable `career-dataset` download, full or direction-scoped. This is the
 * versioned format identified by its own `format` marker; it is separate
 * from the v4 application backup at `/export`, whose payload is unchanged.
 */
export const GET = createRoute((c) => {
  const direction = (c.req.query('direction') ?? '').trim()
  const dataset = buildCareerDataset(db, {
    scope: direction === '' ? 'full' : { directionKey: direction },
  })
  const suffix = direction === '' ? 'full' : direction
  const filename = `career-dataset-${suffix}-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(serializeCareerDataset(dataset), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })
})
