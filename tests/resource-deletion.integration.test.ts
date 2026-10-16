import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('resource deletion protects references and preserves HTMX list/filter boundaries', async () => {
  // UI tests install process-wide repository mocks. Keep this real-DB route
  // check isolated from them, and never touch the user's local database.
  if (process.env.RESOURCE_DELETION_ISOLATED !== '1') {
    const root = mkdtempSync(join(tmpdir(), 'resource-deletion-'))
    try {
      const child = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
        env: {
          ...process.env,
          RESOURCE_DELETION_ISOLATED: '1',
          DB_FILE_NAME: join(root, 'jobs.db'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr))
      expect(child.exitCode).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    return
  }
  const { Hono } = await import('hono')
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../src/db/client')
  const schema = await import('../src/db/schema')
  const { careerTestDatabase } = await import('./support/career-db')
  const fixture = careerTestDatabase()
  try {
    const companyRoutes = await import('../app/routes/companies/[id]')
    const contactRoutes = await import('../app/routes/contacts/[id]')
    const skillRoutes = await import('../app/routes/skills/[id]')
    const app = new Hono()
    app.delete('/companies/:id', ...companyRoutes.DELETE)
    app.delete('/contacts/:id', ...contactRoutes.DELETE)
    app.delete('/skills/:id', ...skillRoutes.DELETE)
    const date = '2026-10-16'
    const prefix = `Deletion-${crypto.randomUUID()}`
    const company = (name: string) =>
      db
        .insert(schema.companies)
        .values({ name: `${prefix}-${name}`, createdAt: date, updatedAt: date })
        .returning()
        .get()
    const contact = (companyId: number, name: string) =>
      db
        .insert(schema.contacts)
        .values({ companyId, name: `${prefix}-${name}`, createdAt: date, updatedAt: date })
        .returning()
        .get()
    const skill = (name: string) =>
      db
        .insert(schema.skills)
        .values({
          name: `${prefix}-${name}`,
          key: `${prefix.toLowerCase()}-${name}`,
          category: 'languages-web',
          reviewStatus: 'approved',
          createdAt: date,
          updatedAt: date,
        })
        .returning()
        .get()
    const remove = (kind: string, id: number | string, query = '') =>
      app.request(`/${kind}/${id}?${query}`, {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
      })
    const boundary = (html: string, kind: string) => {
      expect(html.match(new RegExp(`id="${kind}-results"`, 'g'))).toHaveLength(1)
      expect(html).toContain('id="flash" hx-swap-oob="innerHTML"')
      expect(html).not.toContain('<html')
      expect(html).not.toContain('id="app-shell"')
      expect(html).not.toMatch(/\sid="[^"]*-workspace-(?:shell|panel)"/)
      expect(html).toContain(`hx-delete="/${kind}/`)
      expect(html).toContain('hx-confirm=')
      expect(html).not.toContain('onclick=')
    }

    const unused = company('unused')
    const keepCompany = company('keep')
    let response = await remove('companies', unused.id, `q=${encodeURIComponent(prefix)}`)
    let html = await response.text()
    expect(response.status).toBe(200)
    expect(
      db.select().from(schema.companies).where(eq(schema.companies.id, unused.id)).get(),
    ).toBeUndefined()
    expect(html).toContain(keepCompany.name)
    expect(html).toContain(`value="${prefix}"`)
    expect(html).not.toContain(unused.name)
    boundary(html, 'companies')

    const linkedCompany = company('linked')
    const linkedContact = contact(linkedCompany.id, 'linked-person')
    response = await remove('companies', linkedCompany.id)
    html = await response.text()
    expect(response.status).toBe(409)
    expect(html).toContain('linked to applications or contacts')
    expect(
      db.select().from(schema.companies).where(eq(schema.companies.id, linkedCompany.id)).get(),
    ).toBeDefined()
    expect(
      db.select().from(schema.contacts).where(eq(schema.contacts.id, linkedContact.id)).get(),
    ).toBeDefined()
    boundary(html, 'companies')

    const application = db
      .insert(schema.jobApplications)
      .values({
        companyId: keepCompany.id,
        jobTitle: 'Engineer',
        direction: 'fullstack',
        createdAt: date,
        updatedAt: date,
      })
      .returning()
      .get()
    expect((await remove('companies', keepCompany.id)).status).toBe(409)
    db.insert(schema.jobApplicationsToContacts)
      .values({ jobApplicationId: application.id, contactId: linkedContact.id })
      .run()
    const keepContact = contact(linkedCompany.id, 'keep-person')
    const contactQuery = new URLSearchParams({
      q: prefix,
      company: String(linkedCompany.id),
    }).toString()
    response = await remove('contacts', linkedContact.id, contactQuery)
    html = await response.text()
    expect(response.status).toBe(200)
    expect(
      db.select().from(schema.contacts).where(eq(schema.contacts.id, linkedContact.id)).get(),
    ).toBeUndefined()
    expect(
      db
        .select()
        .from(schema.jobApplicationsToContacts)
        .where(eq(schema.jobApplicationsToContacts.contactId, linkedContact.id))
        .all(),
    ).toEqual([])
    expect(
      db
        .select()
        .from(schema.jobApplications)
        .where(eq(schema.jobApplications.id, application.id))
        .get(),
    ).toBeDefined()
    expect(html).toContain(keepContact.name)
    expect(html).not.toContain(linkedContact.name)
    expect(html).toContain(`value="${linkedCompany.id}" selected`)
    boundary(html, 'contacts')

    const unusedSkill = skill('unused')
    const keepSkill = skill('keep')
    db.insert(schema.skillAliases)
      .values({
        skillId: unusedSkill.id,
        alias: `${prefix} alias`,
        normalizedAlias: `${prefix.toLowerCase()} alias`,
        createdAt: date,
      })
      .run()
    const skillQuery = new URLSearchParams({
      q: prefix,
      category: 'languages-web',
      status: 'approved',
    }).toString()
    response = await remove('skills', unusedSkill.id, skillQuery)
    html = await response.text()
    expect(response.status).toBe(200)
    expect(
      db.select().from(schema.skills).where(eq(schema.skills.id, unusedSkill.id)).get(),
    ).toBeUndefined()
    expect(
      db
        .select()
        .from(schema.skillAliases)
        .where(eq(schema.skillAliases.skillId, unusedSkill.id))
        .all(),
    ).toEqual([])
    expect(html).toContain(keepSkill.name)
    expect(html).toContain('value="languages-web" selected')
    expect(html).toContain('value="approved" selected')
    expect(html).not.toContain(unusedSkill.name)
    boundary(html, 'skills')

    db.insert(schema.careerSkills)
      .values({ skillId: keepSkill.id, level: 'professional', createdAt: date, updatedAt: date })
      .run()
    response = await remove('skills', keepSkill.id, skillQuery)
    html = await response.text()
    expect(response.status).toBe(409)
    expect(html).toContain('Use merge for duplicates')
    expect(
      db.select().from(schema.skills).where(eq(schema.skills.id, keepSkill.id)).get(),
    ).toBeDefined()
    boundary(html, 'skills')

    const mergedTarget = skill('merge-target')
    db.insert(schema.skills)
      .values({
        name: `${prefix}-merged`,
        key: `${prefix.toLowerCase()}-merged`,
        reviewStatus: 'merged',
        mergedIntoSkillId: mergedTarget.id,
        createdAt: date,
        updatedAt: date,
      })
      .run()
    expect((await remove('skills', mergedTarget.id)).status).toBe(409)
    for (const kind of ['contacts', 'companies', 'skills']) {
      for (const invalid of ['invalid', '0', '-1', '1.5', '999999999'])
        expect((await remove(kind, invalid)).status).toBe(404)
    }
    expect(html).not.toContain('onclick=')
    expect(html).toContain('hx-confirm=')
  } finally {
    fixture.cleanup()
  }
}, 15000)
