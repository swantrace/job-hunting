/**
 * Batch Job Post intake: pure parsing and URL safety, no network.
 *
 * Intake preserves input line order, classifies each line as a URL or pasted
 * text, and rejects unsafe URLs before any fetch happens. Failed or blocked
 * URLs become `needs-pasted-text` and are never sent to the LLM as blank or
 * error HTML.
 */

export const intakeItemKinds = ['url', 'text'] as const
export type IntakeItemKind = (typeof intakeItemKinds)[number]

export const intakeItemStates = ['pending', 'needs-pasted-text'] as const
export type IntakeItemState = (typeof intakeItemStates)[number]

export type BatchIntakeItem = {
  /** 1-based position in the original input, preserved across validation. */
  index: number
  raw: string
  kind: IntakeItemKind
  url: string | null
  state: IntakeItemState
  reason: string | null
}

const urlLikePattern = /^[a-z][a-z0-9+.-]*:\/\//i

export function classifyIntakeLine(line: string): IntakeItemKind {
  return urlLikePattern.test(line.trim()) ? 'url' : 'text'
}

export type UrlSafety = { ok: boolean; reason?: string }

const privateV4Pattern =
  /^(0(\.\d{1,3}){3}|10(\.\d{1,3}){3}|100\.(6[4-9]|7\d|8\d|9\d|1[01]\d|12[0-7])(\.\d{1,3}){2}|127(\.\d{1,3}){3}|169\.254(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2}|198\.1[89](\.\d{1,3}){2}|(22[4-9]|23\d)(\.\d{1,3}){3})$/

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '::' || host === '0:0:0:0:0:0:0:1') return true
  if (/^fc[0-9a-f]{2}:/i.test(host) || /^fd[0-9a-f]{2}:/i.test(host)) return true
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true
  return privateV4Pattern.test(host)
}

/**
 * Accepts `https` URLs only. Rejects credentials, localhost, and private or
 * reserved IP literals. Redirect, byte, and time limits are enforced at fetch
 * time; this boundary is the deterministic pre-fetch gate.
 */
export function validateIntakeUrl(value: string): UrlSafety {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, reason: 'Not a valid URL.' }
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'Only https URLs are accepted.' }
  if (parsed.username || parsed.password)
    return { ok: false, reason: 'URLs with embedded credentials are not accepted.' }
  if (isPrivateOrReservedHost(parsed.hostname))
    return { ok: false, reason: 'Localhost and private or reserved addresses are not accepted.' }
  return { ok: true }
}

const MAX_INTAKE_ITEMS = 200
const MAX_INTAKE_LINE_LENGTH = 10_000

/**
 * Splits a pasted block into intake items, preserving order and skipping blank
 * lines. Each line is validated independently; unsafe URLs become
 * `needs-pasted-text` with a reason, never an error that aborts the batch.
 */
export function parseBatchIntake(text: string): BatchIntakeItem[] {
  const items: BatchIntakeItem[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  for (const [lineIndex, rawLine] of lines.entries()) {
    const raw = rawLine.trim()
    if (!raw) continue
    if (raw.length > MAX_INTAKE_LINE_LENGTH) {
      items.push({
        index: lineIndex + 1,
        raw,
        kind: 'text',
        url: null,
        state: 'needs-pasted-text',
        reason: 'Input line is too long; paste a shorter job description.',
      })
      continue
    }
    const kind = classifyIntakeLine(raw)
    if (kind === 'url') {
      const safety = validateIntakeUrl(raw)
      items.push({
        index: lineIndex + 1,
        raw,
        kind,
        url: raw,
        state: safety.ok ? 'pending' : 'needs-pasted-text',
        reason: safety.ok ? null : (safety.reason ?? null),
      })
    } else {
      items.push({
        index: lineIndex + 1,
        raw,
        kind,
        url: null,
        state: 'pending',
        reason: null,
      })
    }
    if (items.length >= MAX_INTAKE_ITEMS)
      throw new Error(`Batch intake is limited to ${MAX_INTAKE_ITEMS} items.`)
  }
  return items
}
