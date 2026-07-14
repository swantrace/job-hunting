import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { createRoute } from 'honox/factory'
import { getArtifact } from '../../../src/db/generation'
import { getArtifactsRoot } from '../../../src/lib/artifact-storage'
import { parseId } from '../../../src/lib/request'

export default createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const row = id ? getArtifact(id) : null
  if (!row) return c.text('Artifact not found.', 404)
  const root = resolve(getArtifactsRoot())
  const filePath = resolve(root, row.artifact.filePath)
  if (relative(root, filePath).startsWith(`..${sep}`) || relative(root, filePath) === '..')
    return c.text('Artifact not found.', 404)
  try {
    return new Response(await readFile(filePath), {
      headers: {
        'Content-Type': row.artifact.mimeType,
        'Content-Disposition': `attachment; filename="${row.artifact.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return c.text('Artifact file is unavailable.', 404)
  }
})
