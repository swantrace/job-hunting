import { Database } from 'bun:sqlite'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { getArtifactsRoot } from '../lib/artifact-storage'

/**
 * Preview-first orphan-artifact audit.
 *
 * Lists physical files under the artifacts directory that are no longer
 * referenced by any `generated_artifacts` or `baseline_generated_artifacts`
 * row. By default it only reports; the destructive `--apply` flag deletes the
 * reported orphan files. The DeepSeek Harness must never run `--apply`.
 */

const dbFile = process.env.DB_FILE_NAME ?? 'jobs.db'
const root = resolve(getArtifactsRoot())

function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

function referencedFiles(sqlite: Database): Set<string> {
  const referenced = new Set<string>()
  const rows = sqlite
    .query(
      'SELECT file_path FROM generated_artifacts UNION SELECT file_path FROM baseline_generated_artifacts',
    )
    .all() as Array<{ file_path: string }>
  for (const row of rows) {
    const value = row.file_path
    if (!value) continue
    const path = resolve(root, value)
    if (path.startsWith(root)) referenced.add(path)
  }
  return referenced
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: bun run src/cli/audit-orphan-artifacts.ts [--apply]')
    console.log('Reports physical artifact files no longer referenced by the database.')
    console.log('--apply deletes them; never run this from the Harness.')
    return
  }
  const apply = process.argv.includes('--apply')
  const sqlite = new Database(dbFile, { create: false })
  const referenced = referencedFiles(sqlite)
  const orphans = walk(root).filter((path) => !referenced.has(path))
  for (const orphan of orphans) console.log(relative(root, orphan))
  console.log(`${orphans.length} orphaned artifact file${orphans.length === 1 ? '' : 's'}.`)
  if (apply) {
    for (const orphan of orphans) rmSync(orphan, { force: true })
    console.log('Deleted orphaned artifact files.')
  } else {
    console.log('Preview only. Re-run with --apply to delete them.')
  }
  sqlite.close()
}

main()
