import { describe, expect, test } from 'bun:test'
import { ApplicationsPage } from '../../app/components/ApplicationsPage'
import { Board, Filters } from '../../app/components/Dashboard'
import { AppNavigation } from '../../app/components/layout/AppNavigation'
import type { Filters as ApplicationFilters } from '../../src/db/queries'
import { renderJsx } from './support/html-contract'
import { mockJob } from './support/runtime-mocks'

const filters: ApplicationFilters = {
  attributes: '',
  priority: '',
  q: '',
  sort: 'updated_desc' as const,
  statuses: '',
  today: '' as const,
  view: 'list' as const,
}

describe('applications page UI contracts', () => {
  test('uses a checkbox column chooser instead of an overflowing multi-select', async () => {
    const html = await renderJsx(<Filters filters={filters} />)

    expect(html).toContain('<details class="dropdown dropdown-end w-full">')
    expect(html).toContain('Choose columns')
    expect(html).toContain('name="attributes"')
    expect(html).not.toMatch(/<select\b[^>]*\bname="attributes"/)
  })

  test('keeps result count and responsive views inside the stable board boundary', async () => {
    const html = await renderJsx(<Board jobs={[mockJob]} filters={filters} />)

    expect(html.match(/\bid="board"/g)).toHaveLength(1)
    expect(html).toMatch(/>1<\/span> application found/)
    expect(html).toContain('<caption class="sr-only">Job applications</caption>')
    expect(html).toContain('md:hidden')
  })

  test('uses contextual application actions instead of global import/export actions', async () => {
    const html = await renderJsx(<ApplicationsPage filters={filters} />)

    expect(html).toContain('Parse job post')
    expect(html).toContain('Quick add')
    expect(html).not.toContain('Export backup')
  })

  test('keeps navigation open on desktop and exposes the drawer control only on mobile', async () => {
    const html = await renderJsx(<ApplicationsPage filters={filters} />)

    expect(html).toContain('drawer min-h-screen bg-base-200 lg:drawer-open')
    expect(html).toMatch(/drawer-button lg:hidden/)
    expect(html).toContain('class="drawer-overlay"')
    expect(html).not.toContain('peer\/nav')
  })

  test('exposes backup and restore as a navigable tool', async () => {
    const html = await renderJsx(<AppNavigation currentPath="/applications" />)

    expect(html).toContain('href="/import"')
    expect(html).toContain('Backup &amp; restore')
    expect(html).not.toContain('href="/export"')
  })
})
