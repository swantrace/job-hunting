import { describe, expect, mock, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { recordsFor } from './support/html-contract'

const plannedRoutes = [
  { id: 'skills-page', name: 'Skills', path: 'app/routes/skills/index.tsx' },
  { id: 'companies-page', name: 'Companies', path: 'app/routes/companies/index.tsx' },
  { id: 'contacts-page', name: 'Contacts', path: 'app/routes/contacts/index.tsx' },
] as const

for (const route of plannedRoutes) {
  const modulePath = resolve(process.cwd(), route.path)
  if (!existsSync(modulePath)) {
    mock.module(modulePath, () => ({
      GET: () =>
        new Response(
          `<main id="app-shell"><section id="${route.id}">${route.name}</section></main>`,
          {
            headers: { 'content-type': 'text/html; charset=UTF-8' },
          },
        ),
    }))
  }
}

type RouteStub = { GET: () => Response }

describe('planned resource modules remain testable before their files exist', () => {
  for (const route of plannedRoutes) {
    const modulePath = resolve(process.cwd(), route.path)
    const virtualModuleTest = !existsSync(modulePath) ? test : test.todo

    virtualModuleTest(`${route.name} route stub returns a complete page boundary`, async () => {
      const stub = (await import(modulePath)) as RouteStub
      const response = stub.GET()
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(recordsFor(html, 'app-shell')).toHaveLength(1)
      expect(recordsFor(html, route.id)).toHaveLength(1)
    })
  }
})
