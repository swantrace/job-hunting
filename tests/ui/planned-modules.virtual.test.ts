import { describe, expect, mock, test } from 'bun:test'
import { resolve } from 'node:path'
import { recordsFor } from './support/html-contract'

const networkRouteModule = resolve(process.cwd(), 'app/routes/network/index.tsx')

mock.module(networkRouteModule, () => ({
  GET: () =>
    new Response(
      '<main id="app-shell"><section id="network-page">Network placeholder</section></main>',
      { headers: { 'content-type': 'text/html; charset=UTF-8' } },
    ),
}))

type NetworkRouteStub = {
  GET: () => Response
}

describe('planned modules remain testable before their files exist', () => {
  test('Network route stub returns a complete page boundary', async () => {
    const stub = (await import(networkRouteModule)) as NetworkRouteStub
    const response = stub.GET()
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'app-shell')).toHaveLength(1)
    expect(recordsFor(html, 'network-page')).toHaveLength(1)
  })
})
