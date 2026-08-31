import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dir, '../..')

/**
 * Local-only PDF text extraction. Production never depends on Ghostscript; this
 * helper exists only for local import/experiment commands.
 */
export async function extractPdfText(path: string): Promise<string> {
  const child = Bun.spawn(
    ['gs', '-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=txtwrite', '-sOutputFile=-', path],
    { cwd: projectRoot, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0) throw new Error(stderr.trim() || `Unable to extract PDF text from ${path}.`)
  return stdout.trim()
}

/** Reads a local import document: PDFs are extracted, everything else is UTF-8. */
export async function readImportDocument(path: string): Promise<string> {
  if (extname(path).toLowerCase() === '.pdf') return extractPdfText(path)
  return readFileSync(path, 'utf8').trim()
}
