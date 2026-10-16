import { resolve } from 'node:path'

export const getArtifactsRoot = () =>
  process.env.ARTIFACTS_DIR ??
  resolve(process.cwd(), process.cwd().endsWith('/dist') ? '..' : '.', 'artifacts')
