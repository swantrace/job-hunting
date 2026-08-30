import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Hono } from 'hono'
import { AppNavigation } from '../../app/components/layout/AppNavigation'
import { mergeCompanies } from '../../src/db/company-service'
import * as schema from '../../src/db/schema'
import { migratedDatabase } from '../support/sqlite'
import { renderJsx } from './support/html-contract'
import './support/runtime-mocks'

const resources = [
  {
    componentDirectory: 'app/components/skills',
    ids: ['skills-results', 'skill-workspace-shell', 'skill-workspace-panel'],
    label: 'Skills',
    route: '/skills',
    routeFile: 'app/routes/skills/index.tsx',
  },
  {
    componentDirectory: 'app/components/companies',
    ids: ['companies-results', 'company-workspace-shell', 'company-workspace-panel'],
    label: 'Companies',
    route: '/companies',
    routeFile: 'app/routes/companies/index.tsx',
  },
  {
    componentDirectory: 'app/components/contacts',
    ids: ['contacts-results', 'contact-workspace-shell', 'contact-workspace-panel'],
    label: 'Contacts',
    route: '/contacts',
    routeFile: 'app/routes/contacts/index.tsx',
  },
] as const

const resourcePagesImplemented = resources.every((resource) =>
  existsSync(resolve(process.cwd(), resource.routeFile)),
)
const resourcePageTest = resourcePagesImplemented ? test : test.todo

function readTsxTree(directory: string) {
  const absolute = resolve(process.cwd(), directory)
  if (!existsSync(absolute)) return ''
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => readFileSync(resolve(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
}

describe('planned resource page UI contracts', () => {
  resourcePageTest('replaces Manage data with bookmarkable resource navigation', async () => {
    const html = await renderJsx(<AppNavigation currentPath="/skills" />)

    for (const resource of resources) {
      expect(html).toContain(`href="${resource.route}"`)
      expect(html).toContain(resource.label)
    }
    expect(html).toContain('Network')
    expect(html).not.toContain('href="/manage"')
    expect(html).not.toContain('Manage data')
  })

  for (const resource of resources) {
    resourcePageTest(`${resource.label} owns stable list and workspace boundaries`, () => {
      const source = readTsxTree(resource.componentDirectory)
      for (const id of resource.ids) expect(source).toContain(`id="${id}"`)
    })
  }

  for (const resource of resources) {
    resourcePageTest(`${resource.label} opens an editable resource workspace`, () => {
      const source = readTsxTree(resource.componentDirectory)
      expect(source).toContain('Edit')
      expect(source).toContain('data-open-drawer')
      expect(source).toContain('hx-put=')
      expect(source).toContain('Save changes')
      expect(source).toContain('Cancel')
    })
  }

  resourcePageTest(
    'keeps Skills independent and groups Companies and Contacts under Network',
    async () => {
      const html = await renderJsx(<AppNavigation currentPath="/contacts" />)
      const skillsIndex = html.indexOf('Skills')
      const networkIndex = html.indexOf('Network')
      const companiesIndex = html.indexOf('Companies')
      const contactsIndex = html.indexOf('Contacts')

      expect(skillsIndex).toBeGreaterThan(-1)
      expect(networkIndex).toBeGreaterThan(skillsIndex)
      expect(companiesIndex).toBeGreaterThan(networkIndex)
      expect(contactsIndex).toBeGreaterThan(companiesIndex)
    },
  )

  resourcePageTest('links a company contact count to a scoped Contacts view', () => {
    const companySource = readTsxTree('app/components/companies')
    const contactSource = readTsxTree('app/components/contacts')
    const contactsRoute = readFileSync(
      resolve(process.cwd(), 'app/routes/contacts/index.tsx'),
      'utf8',
    )

    expect(companySource).toContain('/contacts?company=${company.id}')
    expect(contactSource).toContain('Clear company filter')
    expect(contactSource).toContain('<select name="company"')
    expect(contactSource).toContain("change from:select[name='company']")
    expect(contactsRoute).toContain('contact.companyId === Number(filters.company)')
    expect(contactsRoute).toContain("c.req.header('HX-Request') === 'true'")
  })

  test('merges companies transactionally without losing applications or contacts', () => {
    const sqlite = migratedDatabase()
    const db = drizzle({ client: sqlite, schema })
    try {
      const source = sqlite
        .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
        .get('Source Co', '2026-08-28', '2026-08-28') as { id: number }
      const target = sqlite
        .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
        .get('Target Co', '2026-08-28', '2026-08-28') as { id: number }
      sqlite
        .query(
          `INSERT INTO job_applications (
            company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          source.id,
          'Engineer',
          'fullstack',
          '2026-08-28',
          'B',
          'Saved',
          '2026-08-28',
          '2026-08-28',
        )
      sqlite
        .query(
          'INSERT INTO contacts (company_id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(source.id, 'Alex', 'alex@example.com', '2026-08-28', '2026-08-28')

      mergeCompanies(source.id, target.id, db)

      const application = sqlite.query('SELECT company_id FROM job_applications LIMIT 1').get() as {
        company_id: number
      }
      expect(application.company_id).toBe(target.id)
      const contact = sqlite.query('SELECT company_id FROM contacts LIMIT 1').get() as {
        company_id: number
      }
      expect(contact.company_id).toBe(target.id)
      expect(
        sqlite.query('SELECT count(*) AS count FROM companies').get() as { count: number },
      ).toEqual({ count: 1 })
    } finally {
      sqlite.close()
    }
  })

  test('keeps contact details current after editing on the Contacts page', () => {
    const sqlite = migratedDatabase()
    try {
      const company = sqlite
        .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
        .get('Acme', '2026-08-28', '2026-08-28') as { id: number }
      const contact = sqlite
        .query(
          'INSERT INTO contacts (company_id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
        )
        .get(company.id, 'Alex', 'alex@example.com', '2026-08-28', '2026-08-28') as { id: number }

      sqlite
        .query('UPDATE contacts SET name = ?, email = ? WHERE id = ?')
        .run('Alex Rivera', 'alex.rivera@example.com', contact.id)

      const updated = sqlite
        .query(
          `SELECT c.name, c.email, co.name AS company_name
           FROM contacts c JOIN companies co ON co.id = c.company_id WHERE c.id = ?`,
        )
        .get(contact.id) as { name: string; email: string; company_name: string }
      expect(updated).toEqual({
        name: 'Alex Rivera',
        email: 'alex.rivera@example.com',
        company_name: 'Acme',
      })
    } finally {
      sqlite.close()
    }
  })

  test('redirects the old /manage URL to the Skills page', async () => {
    const { default: manageRoute } = (await import('../../app/routes/manage/index')) as Record<
      string,
      unknown
    >
    const app = new Hono()
    app.get('/manage', manageRoute as never)
    const response = await app.request('/manage')

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/skills')
  })
})
