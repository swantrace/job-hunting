import { createRoute } from 'honox/factory'
import { getArtifact, markArtifactUploadFailed } from '../../../../src/db/generation'
import { uploadArtifactToGoogleDrive } from '../../../../src/lib/google-drive'
import { parseId } from '../../../../src/lib/request'
import { ArtifactActions } from '../../../components/Workspace'

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const row = id ? getArtifact(id) : null
  if (!row) return c.html(<div class="alert alert-error">Artifact not found.</div>, 404)
  try {
    await uploadArtifactToGoogleDrive(row.artifact)
  } catch (error) {
    markArtifactUploadFailed(row.artifact.id, error)
  }
  const updated = getArtifact(row.artifact.id)
  return c.html(<ArtifactActions artifact={updated?.artifact ?? row.artifact} />)
})
