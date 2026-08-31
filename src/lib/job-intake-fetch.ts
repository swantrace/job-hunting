import { validateIntakeUrl } from './batch-intake'

/**
 * Safe URL ingestion for batch Job Post intake. Accepts https only, follows a
 * bounded number of safe redirects, enforces byte and time limits, strips
 * scripts and styles, and never solves CAPTCHA, authenticates, automates a
 * browser, or evades bot controls. Blocked or failed fetches return a reason and
 * are surfaced as "Needs pasted text" — never sent to the LLM.
 */

const MAX_BYTES = 2_000_000
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 20_000
const redirectStatuses = new Set([301, 302, 303, 307, 308])

export type IntakeFetchResult = { ok: true; text: string } | { ok: false; reason: string }

async function fetchFollowingRedirects(url: string, redirectsLeft: number): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'JobTracker/1.0 (local job intake)' },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new Error('The job posting timed out.')
    throw error
  }
  if (redirectStatuses.has(response.status)) {
    if (redirectsLeft <= 0) throw new Error('Too many redirects.')
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect without a location.')
    const next = new URL(location, url)
    const safety = validateIntakeUrl(next.toString())
    if (!safety.ok) throw new Error(`Unsafe redirect: ${safety.reason}`)
    return fetchFollowingRedirects(next.toString(), redirectsLeft - 1)
  }
  return response
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) throw new Error('The job posting exceeds the download limit.')
    chunks.push(value)
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(buffer)
}

/** Strips scripts, styles, and remaining markup, decoding common entities. */
export function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchJobPostingText(url: string): Promise<IntakeFetchResult> {
  try {
    const response = await fetchFollowingRedirects(url, MAX_REDIRECTS)
    if (!response.ok) return { ok: false, reason: `The site returned HTTP ${response.status}.` }
    const html = await readBodyCapped(response, MAX_BYTES)
    const text = stripScriptsAndStyles(html)
    if (!text) return { ok: false, reason: 'No readable text was extracted.' }
    return { ok: true, text }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Unable to fetch the URL.',
    }
  }
}
