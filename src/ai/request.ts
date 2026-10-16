/** Single-process provider budget shared by all stages and development workers. */
let active = 0
const waiting: (() => void)[] = []
export function openAIConcurrency() {
  const n = Number(process.env.OPENAI_MAX_CONCURRENT_REQUESTS ?? 3)
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 3
}
async function acquire(signal?: AbortSignal | null) {
  if (signal?.aborted) throw signal.reason
  if (active < openAIConcurrency()) {
    active++
    return
  }
  await new Promise<void>((resolve, reject) => {
    const ready = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const abort = () => {
      const i = waiting.indexOf(ready)
      if (i >= 0) waiting.splice(i, 1)
      reject(signal?.reason)
    }
    waiting.push(ready)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
function release() {
  const next = waiting.shift()
  if (next) next()
  else active--
}
function pause(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
export async function openAIRequest(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const started = Date.now()
  const { timeoutMs, ...request } = init
  let signal = request.signal
  let startedProviderBudget = false
  for (let attempt = 0; ; attempt++) {
    await acquire(signal)
    if (!startedProviderBudget && timeoutMs) {
      const timeout = AbortSignal.timeout(timeoutMs)
      signal = signal ? AbortSignal.any([signal, timeout]) : timeout
      startedProviderBudget = true
    }
    let response: Response
    let body: string
    try {
      response = await fetch(url, { ...request, signal })
      body = await response.text()
    } finally {
      release()
    }
    let code = ''
    let tokens: unknown
    try {
      const parsed = JSON.parse(body)
      code = parsed.error?.code ?? ''
      tokens = parsed.usage?.total_tokens
    } catch {
      /* Provider may return a non-JSON error. */
    }
    const permanent = [
      'insufficient_quota',
      'billing_hard_limit_reached',
      'usage_limit_reached',
    ].includes(code)
    if (attempt < 2 && !permanent && [429, 500, 502, 503, 504].includes(response.status)) {
      const header = response.headers.get('Retry-After')
      const retry = header
        ? Number.isFinite(Number(header))
          ? Number(header) * 1000
          : Date.parse(header) - Date.now()
        : NaN
      await pause(
        Number.isFinite(retry) ? Math.max(0, retry) : 1000 * 2 ** attempt + Math.random() * 500,
        signal,
      )
      continue
    }
    if (process.env.NODE_ENV !== 'test')
      console.info('AI request', {
        status: response.status,
        milliseconds: Date.now() - started,
        attempts: attempt + 1,
        tokens,
      })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}
