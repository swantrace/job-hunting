import { expect, test } from 'bun:test'
import { openAIRequest } from '../src/ai/request'

test('all provider stages share the same concurrency budget and queued aborts release correctly', async () => {
  const previousFetch = globalThis.fetch
  const previousLimit = process.env.OPENAI_MAX_CONCURRENT_REQUESTS
  process.env.OPENAI_MAX_CONCURRENT_REQUESTS = '2'
  let active = 0
  let maximum = 0
  globalThis.fetch = (async () => {
    active++
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active--
    return Response.json({ output_text: 'ok' })
  }) as unknown as typeof fetch
  try {
    await Promise.all(Array.from({ length: 8 }, () => openAIRequest('https://example.com', {})))
    expect(maximum).toBe(2)
    const signal = AbortSignal.abort(new Error('Cancelled'))
    await expect(openAIRequest('https://example.com', { signal })).rejects.toThrow('Cancelled')
    expect((await openAIRequest('https://example.com', {})).ok).toBe(true)
  } finally {
    globalThis.fetch = previousFetch
    if (previousLimit === undefined) delete process.env.OPENAI_MAX_CONCURRENT_REQUESTS
    else process.env.OPENAI_MAX_CONCURRENT_REQUESTS = previousLimit
  }
})

test('provider retry honors Retry-After and never retries exhausted quota', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () =>
    ++calls === 1
      ? Response.json(
          { error: { code: 'rate_limit_exceeded' } },
          { status: 429, headers: { 'Retry-After': '0' } },
        )
      : Response.json({ ok: true })) as unknown as typeof fetch
  try {
    expect((await openAIRequest('https://example.com', {})).ok).toBe(true)
    expect(calls).toBe(2)
    calls = 0
    globalThis.fetch = (async () => {
      calls++
      return Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 })
    }) as unknown as typeof fetch
    expect((await openAIRequest('https://example.com', {})).status).toBe(429)
    expect(calls).toBe(1)
  } finally {
    globalThis.fetch = previous
  }
})

test('cancelling a waiting request does not consume or leak a provider slot', async () => {
  const previousFetch = globalThis.fetch
  const previousLimit = process.env.OPENAI_MAX_CONCURRENT_REQUESTS
  process.env.OPENAI_MAX_CONCURRENT_REQUESTS = '1'
  let unblock!: () => void
  let notifyStarted!: () => void
  const held = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve
  })
  let calls = 0
  globalThis.fetch = (async () => {
    if (++calls === 1) {
      notifyStarted()
      await held
    }
    return Response.json({ ok: true })
  }) as unknown as typeof fetch
  try {
    const first = openAIRequest('https://example.com', {})
    await started
    const controller = new AbortController()
    const queued = openAIRequest('https://example.com', { signal: controller.signal })
    controller.abort(new Error('Queued cancellation'))
    await expect(queued).rejects.toThrow('Queued cancellation')
    unblock()
    await first
    expect((await openAIRequest('https://example.com', {})).ok).toBe(true)
    expect(calls).toBe(2)
  } finally {
    unblock()
    globalThis.fetch = previousFetch
    if (previousLimit === undefined) delete process.env.OPENAI_MAX_CONCURRENT_REQUESTS
    else process.env.OPENAI_MAX_CONCURRENT_REQUESTS = previousLimit
  }
})
