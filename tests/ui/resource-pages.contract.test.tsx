import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AppNavigation } from '../../app/components/layout/AppNavigation'
import { renderJsx } from './support/html-contract'

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

  test.todo('merges companies transactionally without losing applications or contacts', () => {})
  test.todo('keeps application contact fragments current after editing on the Contacts page', () => {})
})
