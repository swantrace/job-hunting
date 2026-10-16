import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('skill import preview, export and editor share real database contracts', async () => {
  // Isolate real routes from process-wide UI repository mocks.
  if (process.env.SKILL_MAINTENANCE_ISOLATED !== '1') {
    const root = mkdtempSync(join(tmpdir(), 'skill-maintenance-'))
    try {
      const child = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
        env: {
          ...process.env,
          SKILL_MAINTENANCE_ISOLATED: '1',
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
  const { skills, careerSkills } = await import('../src/db/schema')
  const { insertSkill } = await import('../src/db/skill-queries')
  const { listSkillAliases } = await import('../src/db/skill-service')
  const { skillImportState } = await import('../src/db/skill-import')
  const { previewImport, mergeImport, exportData } = await import('../src/db/queries')
  const { importPayloadSchema } = await import('../src/lib/job-intake/import')
  const routes = await import('../app/routes/skills/[id]')
  const { careerTestDatabase } = await import('./support/career-db')
  const fixture = careerTestDatabase()
  try {
    const skill = insertSkill(db, { name: 'Maintenance Framework', key: 'maintenance-framework' })
    const payload = importPayloadSchema.parse({
      schemaVersion: 6,
      skills: [{ key: skill.key, name: 'Renamed Framework', aliases: ['Framework JS'] }],
    })
    const before = skillImportState(db)
    const preview = previewImport(payload)
    expect(preview.conflicts).toEqual([])
    expect(preview.summary.skills).toMatchObject({ created: 0, updated: 1, conflicts: 0 })
    expect(preview.skillChanges).toEqual([
      {
        key: skill.key,
        action: 'updated',
        addedAliases: ['Framework JS'],
        removedAliases: ['Maintenance Framework'],
      },
    ])
    expect(skillImportState(db)).toEqual(before)
    mergeImport(payload)
    expect(listSkillAliases(skill.id)).toEqual(['Framework JS'])
    expect(previewImport(payload).summary.skills.unchanged).toBe(1)
    const exported = exportData()
    expect(exported.schemaVersion).toBe(6)
    expect(exported).not.toHaveProperty('skillAliases')
    expect(exported.skills.find((row) => row.id === skill.id)).toMatchObject({
      key: skill.key,
      aliases: ['Framework JS'],
    })

    const protectedSkill = insertSkill(db, {
      name: 'Protected Maintenance',
      key: 'protected-maintenance',
      origin: 'career-data',
    })
    const protectedPayload = importPayloadSchema.parse({
      schemaVersion: 6,
      skills: [{ key: protectedSkill.key, name: 'Untrusted Rename' }],
    })
    expect(previewImport(protectedPayload).notices.join(' ')).toContain('protected')
    mergeImport(protectedPayload)
    expect(db.select().from(skills).where(eq(skills.id, protectedSkill.id)).get()?.name).toBe(
      'Protected Maintenance',
    )

    db.insert(careerSkills)
      .values({ skillId: protectedSkill.id, createdAt: '2026-10-16', updatedAt: '2026-10-16' })
      .run()
    const blocked = importPayloadSchema.parse({
      schemaVersion: 6,
      skills: [{ key: skill.key, name: 'Must roll back' }],
      deleteSkills: [protectedSkill.key],
    })
    const current = skillImportState(db)
    expect(previewImport(blocked).conflicts.join(' ')).toContain('Cannot delete')
    expect(() => mergeImport(blocked)).toThrow('Cannot delete')
    expect(skillImportState(db)).toEqual(current)
    const deletion = importPayloadSchema.parse({ schemaVersion: 6, deleteSkills: [skill.key] })
    expect(previewImport(deletion).skillChanges[0].action).toBe('deleted')
    expect(skillImportState(db)).toEqual(current)

    const app = new Hono()
    app.put('/skills/:id', ...routes.PUT)
    app.get('/skills/:id', ...routes.GET)
    let response = await app.request(`/skills/${skill.id}`)
    expect(await response.text()).toContain('name="aliases"')
    const put = (form: Record<string, string>) =>
      app.request(`/skills/${skill.id}`, { method: 'PUT', body: new URLSearchParams(form) })
    response = await put({
      name: 'Updated Framework',
      reviewStatus: 'approved',
      aliases: 'Framework Runtime\nFrameworkJS',
    })
    expect(response.status).toBe(200)
    let html = await response.text()
    expect(html).toContain('id="skills-results" hx-swap-oob="outerHTML"')
    expect(html).not.toContain('id="app-shell"')
    expect(db.select().from(skills).where(eq(skills.id, skill.id)).get()?.key).toBe(skill.key)
    response = await put({
      name: 'Unsaved Framework',
      reviewStatus: 'approved',
      aliases: protectedSkill.name,
    })
    expect(response.status).toBe(422)
    html = await response.text()
    expect(html).toContain('Unsaved Framework')
    expect(html).toContain(protectedSkill.name)
    expect(html).toContain('belongs to another skill')
    expect(html).toContain('aria-describedby=')
    expect(html).not.toContain('id="skills-results"')
    expect(listSkillAliases(skill.id)).toEqual(['Framework Runtime', 'FrameworkJS'])
    response = await put({ name: 'Updated Framework', reviewStatus: 'approved', aliases: '' })
    expect(response.status).toBe(200)
    expect(listSkillAliases(skill.id)).toEqual([])
  } finally {
    fixture.cleanup()
  }
}, 20000)
