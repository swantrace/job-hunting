import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { fragmentRecords, recordsFor } from './support/html-contract'
import {
  type MappingFixture,
  removeMappingFixture,
  seedMappingFixture,
  storedAliases,
  storedCareerSkills,
  storedJunctions,
  storedMention,
  storedSkill,
} from './support/mapping-db'
import {
  mappingFixture,
  mentionRowFixture,
  mockGetApplication,
  mockGetCandidateAnalysisState,
  mockJob,
  mockListRunSkillReviews,
  mockLoadReviewData,
  reviewDataFixture,
} from './support/runtime-mocks'

/**
 * route acceptance: the mapping HTMX contract, driven through the real
 * service and the mention repository against the suite's isolated
 * database.
 *
 * Blank selection is rejected on the row's own form and is never a Skip; a
 * success returns the stable `#skill-review-panel` plus intentional OOB
 * fragments (tabs, readiness) so the active Review tab, filters and adjacent
 * Contact/Activity content survive; a catalog collision is a 422 on the create
 * form only; and forged or foreign ids are a safe 404 with no write.
 *
 * Fragments never render AppShell; the full workspace page does.
 */

const fixtureRequirementSkill = {
  aliases: [],
  analysisResult: 'not-in-career-data',
  category: null,
  confidence: null,
  decision: 'pending',
  decisionReason: null,
  importance: 'required',
  rawLabel: null,
  requirementId: 1,
  requirementSequence: 1,
  requirementStatement: 'Fixture requirement',
  reviewStatus: 'approved',
  skillId: 12,
  skillKey: 'fixture-skill',
  skillName: 'Fixture Skill',
}

const neverRunState = {
  currentCompleted: null,
  latest: null,
  latestCompleted: null,
  reasons: [] as string[],
  staleCompleted: null,
  state: 'never-run',
}

let fixture: MappingFixture

function useFixture(): MappingFixture {
  mockGetApplication.mockReturnValue({ ...mockJob, id: fixture.applicationId } as never)
  return fixture
}

async function mappingHarness() {
  const { POST } = (await import('../../app/routes/applications/[id]/skill-mentions')) as Record<
    string,
    unknown
  >
  const { default: searchRoute } = (await import(
    '../../app/routes/applications/[id]/skill-mentions/search'
  )) as Record<string, unknown>
  const { default: workspaceRoute } = (await import(
    '../../app/routes/applications/[id]/workspace'
  )) as Record<string, unknown>
  const app = new Hono()
  app.post('/applications/:id/skill-mentions', POST as never)
  app.get('/applications/:id/skill-mentions/search', searchRoute as never)
  app.get('/applications/:id/workspace', workspaceRoute as never)
  return app
}

async function post(body: Record<string, string>, applicationId = fixture.applicationId) {
  const app = await mappingHarness()
  return app.request(`/applications/${applicationId}/skill-mentions`, {
    method: 'POST',
    body: new URLSearchParams(body),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
}

async function search(mentionId: number, q: string, applicationId = fixture.applicationId) {
  const app = await mappingHarness()
  return app.request(
    `/applications/${applicationId}/skill-mentions/search?mentionId=${mentionId}&q=${encodeURIComponent(q)}`,
  )
}

beforeEach(() => {
  fixture = seedMappingFixture()
})

afterEach(() => {
  removeMappingFixture(fixture)
  mockGetApplication.mockReturnValue(mockJob)
  mockGetCandidateAnalysisState.mockReturnValue(neverRunState)
  mockListRunSkillReviews.mockReturnValue([])
  mockLoadReviewData.mockReturnValue(reviewDataFixture())
})

describe('blank selection is rejected and is never a Skip', () => {
  test('returns only the row form with a 422, and writes nothing', async () => {
    useFixture()
    const response = await post({
      action: 'map',
      mentionId: String(fixture.mentionId),
      skillId: '',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe(`#skill-mention-${fixture.mentionId}`)
    expect(recordsFor(html, `skill-mention-${fixture.mentionId}`)).toHaveLength(1)
    expect(recordsFor(html, 'skill-review-panel')).toHaveLength(0)
    expect(html).toContain('A blank selection is not a decision')
    expect(storedMention(fixture.mentionId)).toMatchObject({
      mapping_state: 'pending',
      resolved_skill_id: null,
    })
    expect(storedJunctions(fixture.kubernetesId)).toEqual([])
  })

  test('an explicit Skip needs no reason, records skipped and updates OOB siblings', async () => {
    useFixture()
    const response = await post({ action: 'skip', mentionId: String(fixture.mentionId) })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(storedMention(fixture.mentionId)).toMatchObject({
      mapping_state: 'skipped',
      resolved_skill_id: null,
    })
    expect(recordsFor(html, 'skill-review-panel')).toEqual([
      expect.objectContaining({ depth: 0, id: 'skill-review-panel', oob: undefined }),
    ])
    expect(recordsFor(html, 'skill-mapping-panel')).toHaveLength(1)
    expect(recordsFor(html, 'workspace-tabs')).toEqual([
      expect.objectContaining({ depth: 0, id: 'workspace-tabs', oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'requirement-readiness')).toEqual([
      expect.objectContaining({ depth: 0, id: 'requirement-readiness', oob: 'outerHTML' }),
    ])
  })
})

describe('mapping mutations', () => {
  test('maps a pending term to the chosen catalog skill and creates no personal skill', async () => {
    useFixture()
    const response = await post({
      action: 'map',
      mentionId: String(fixture.mentionId),
      skillId: String(fixture.kubernetesId),
    })

    expect(response.status).toBe(200)
    expect(storedMention(fixture.mentionId)).toMatchObject({
      mapping_state: 'mapped',
      resolved_skill_id: fixture.kubernetesId,
    })
    expect(storedJunctions(fixture.kubernetesId)).toEqual([{ raw_label: 'Kubernetes' }])
    // Mapping never claims the candidate possesses the skill.
    expect(storedCareerSkills(fixture.kubernetesId)).toBe(0)
    expect(await response.text()).toContain('badge-success')
  })

  test('unmaps a mapped term back to pending and removes the junction', async () => {
    useFixture()
    await post({
      action: 'map',
      mentionId: String(fixture.mentionId),
      skillId: String(fixture.kubernetesId),
    })

    const response = await post({ action: 'unmap', mentionId: String(fixture.mentionId) })

    expect(response.status).toBe(200)
    expect(storedMention(fixture.mentionId)).toMatchObject({
      mapping_state: 'pending',
      resolved_skill_id: null,
    })
    expect(storedJunctions(fixture.kubernetesId)).toEqual([])
  })

  test('remembers an alias only through the explicit action', async () => {
    useFixture()
    await post({
      action: 'map',
      mentionId: String(fixture.mentionId),
      skillId: String(fixture.kubernetesId),
    })
    expect(storedAliases(fixture.kubernetesId)).toEqual([])

    const response = await post({
      action: 'remember-alias',
      alias: 'K8s',
      mentionId: String(fixture.mentionId),
    })

    expect(response.status).toBe(200)
    expect(storedAliases(fixture.kubernetesId)).toEqual(['K8s'])
  })

  test('an unapproved or missing target becomes a 422 on the row, not a broken page', async () => {
    useFixture()
    const response = await post({
      action: 'map',
      mentionId: String(fixture.mentionId),
      skillId: '999999',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe(`#skill-mention-${fixture.mentionId}`)
    expect(recordsFor(html, `skill-mention-${fixture.mentionId}`)).toHaveLength(1)
    expect(recordsFor(html, 'skill-review-panel')).toHaveLength(0)
    expect(storedMention(fixture.mentionId)).toMatchObject({ mapping_state: 'pending' })
  })
})

describe('catalog creation', () => {
  test('creates the catalog entry and maps the term without touching personal skills', async () => {
    useFixture()
    const response = await post({
      action: 'create-skill',
      category: fixture.categoryKey,
      mentionId: String(fixture.mentionId),
      name: 'Fixture Grafana',
    })

    expect(response.status).toBe(200)
    const created = storedSkill('fixture-grafana')
    expect(created).toMatchObject({
      category: fixture.categoryKey,
      key: 'fixture-grafana',
      name: 'Fixture Grafana',
      origin: 'manual',
      review_status: 'approved',
    })
    expect(storedMention(fixture.mentionId)).toMatchObject({
      mapping_state: 'mapped',
      resolved_skill_id: created?.id ?? -1,
    })
    // Creating a catalog entry creates no alias and no personal skill.
    expect(storedAliases(created?.id ?? -1)).toEqual([])
    expect(storedCareerSkills(created?.id ?? -1)).toBe(0)
    expect(await response.text()).toContain('badge-success')
  })

  test('reports a key collision as a 422 on the create form only', async () => {
    useFixture()
    const response = await post({
      action: 'create-skill',
      name: 'Fixture Kubernetes',
      mentionId: String(fixture.mentionId),
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#create-skill-form')
    expect(recordsFor(html, 'create-skill-form')).toHaveLength(1)
    expect(recordsFor(html, 'skill-mapping-panel')).toHaveLength(0)
    expect(recordsFor(html, 'skill-review-panel')).toHaveLength(0)
    expect(html).toContain('is already used by')
    expect(html).toContain('id="create-skill-name-error"')
    expect(html).toContain('aria-describedby="create-skill-name-help create-skill-name-error"')
    expect(html).toContain('value="Fixture Kubernetes"')
    expect(storedMention(fixture.mentionId)).toMatchObject({ mapping_state: 'pending' })
  })

  test('reports an unknown category as a 422 on the create form', async () => {
    useFixture()
    const response = await post({
      action: 'create-skill',
      category: 'not-a-real-category',
      name: 'Fixture Loki',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#create-skill-form')
    expect(html).toContain('Choose a category from the current taxonomy.')
    expect(storedSkill('fixture-loki')).toBeNull()
  })

  test('hands a Create new skill… selection to the create form with the typed term', async () => {
    useFixture()
    const response = await post({
      action: 'map',
      mentionId: String(fixture.mentionId),
      skillId: 'create:Azure Arc',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#create-skill-form')
    expect(recordsFor(html, 'create-skill-form')).toHaveLength(1)
    expect(html).toContain('value="Azure Arc"')
    expect(storedMention(fixture.mentionId)).toMatchObject({ mapping_state: 'pending' })
  })
})

describe('forged and foreign ids', () => {
  test('an unknown mention id is a 404 and writes nothing', async () => {
    useFixture()
    const response = await post({ action: 'map', mentionId: '999999', skillId: '5' })

    expect(response.status).toBe(404)
    expect(storedJunctions(fixture.kubernetesId)).toEqual([])
  })

  test('a mention owned by another application is a 404 and writes nothing', async () => {
    useFixture()
    for (const body of [
      { action: 'map', mentionId: String(fixture.otherMentionId), skillId: '5' },
      { action: 'skip', mentionId: String(fixture.otherMentionId) },
      { action: 'unmap', mentionId: String(fixture.otherMentionId) },
      { action: 'remember-alias', alias: 'K8s', mentionId: String(fixture.otherMentionId) },
    ] as Array<Record<string, string>>) {
      const response = await post(body)
      expect(response.status).toBe(404)
    }
    expect(storedMention(fixture.otherMentionId)).toMatchObject({
      mapping_state: 'pending',
      resolved_skill_id: null,
    })
    expect(storedAliases(fixture.kubernetesId)).toEqual([])
  })

  test('an unknown action is a 422 retargeted at the panel', async () => {
    useFixture()
    const response = await post({
      action: 'delete-everything',
      mentionId: String(fixture.mentionId),
    })

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#skill-review-panel')
  })
})

describe('selector search fragment', () => {
  test('returns only the bounded catalog select, never a shell', async () => {
    useFixture()
    const response = await search(fixture.mentionId, 'Fixture Kubernetes')
    const html = await response.text()

    expect(response.status).toBe(200)
    // The option list must be returned inside the select: browsers ignore
    // options swapped into a detached container.
    expect(html).toContain(`<select id="mention-skill-select-${fixture.mentionId}"`)
    expect(html).toContain(`<option value="${fixture.kubernetesId}">`)
    expect(html).toContain('Fixture Kubernetes')
    expect(html).not.toContain('<html')
    expect(html).not.toContain('app-nav-toggle')
    expect(recordsFor(html, 'skill-mapping-panel')).toHaveLength(0)
  })

  test('an unlisted term offers only the create hand-off, never a fuzzy match', async () => {
    useFixture()
    const html = await (await search(fixture.mentionId, 'Zzz Nothing Matches')).text()

    expect(html).toContain('No approved catalog skill matches')
    expect(html).not.toContain('Fixture Playwright')
  })

  test('a forged mention id returns an empty list instead of another application’s data', async () => {
    useFixture()
    const html = await (await search(999999, 'Fixture Kubernetes')).text()

    expect(html).toContain('disabled')
    expect(html).not.toContain(`<option value="${fixture.kubernetesId}">`)
  })

  test('a mention owned by another application returns no catalog data', async () => {
    useFixture()
    const html = await (
      await search(fixture.otherMentionId, 'Fixture Kubernetes', fixture.applicationId)
    ).text()

    expect(html).toContain('disabled')
    expect(html).not.toContain(`<option value="${fixture.kubernetesId}">`)
  })
})

describe('HTMX boundaries and preserved workspace state', () => {
  test('the full Review page renders AppShell once with each fragment root once', async () => {
    const seeded = useFixture()
    mockLoadReviewData.mockReturnValue(
      reviewDataFixture({
        jobAnalysisCurrent: true,
        mapping: mappingFixture({
          mentions: [
            mentionRowFixture({ id: seeded.mentionId }),
            mentionRowFixture({ id: 42, mappingState: 'mapped', resolvedSkillId: 12 }),
          ],
          pendingCount: 1,
        }),
      }),
    )
    const app = await mappingHarness()
    const response = await app.request(
      `/applications/${seeded.applicationId}/workspace?workspaceTab=review`,
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('app-nav-toggle')
    expect(recordsFor(html, 'skill-mapping-panel')).toHaveLength(1)
    expect(recordsFor(html, `skill-mention-${seeded.mentionId}`)).toHaveLength(1)
    expect(recordsFor(html, 'create-skill-form')).toHaveLength(1)
    const ids = fragmentRecords(html).map((record) => record.id)
    for (const id of ['skill-review-panel', 'skill-mapping-panel', 'create-skill-form']) {
      expect(ids.filter((candidate) => candidate === id)).toHaveLength(1)
    }
  })

  test('a mapping mutation keeps the active Review tab, filters and adjacent panels', async () => {
    useFixture()
    const response = await post({
      action: 'map',
      mentionId: String(fixture.mentionId),
      skillId: String(fixture.playwrightId),
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    const reviewTab = html.match(/<button\b[^>]*id="workspace-tab-review"[^>]*>/)?.[0]
    expect(reviewTab).toContain('aria-selected="true"')
    // Filters travel with the form so a board filter/sort is never reset.
    expect(html).toContain('sort=updated_desc')
    expect(html).toContain('workspaceTab=review')
    // Fragments never duplicate the sidebar or AppShell.
    expect(html).not.toContain('app-nav-toggle')
    expect(html).not.toMatch(/<html|<body/)
  })

  test('every row form targets the response’s main fragment root', async () => {
    const seeded = useFixture()
    mockLoadReviewData.mockReturnValue(
      reviewDataFixture({
        jobAnalysisCurrent: true,
        mapping: mappingFixture({
          groups: [
            {
              category: null,
              importance: 'preferred',
              skillId: seeded.playwrightId,
              skillKey: 'fixture-playwright',
              skillName: 'Fixture Playwright',
              sources: [
                {
                  importance: 'preferred',
                  mentionId: 42,
                  normalizedTerm: 'fixture playwright',
                  rawTerm: 'Fixture Playwright',
                  requirementId: 2,
                  requirementSequence: 2,
                  requirementStatement: 'Operate Playwright suites.',
                },
              ],
            },
          ],
          mentions: [
            mentionRowFixture({ id: seeded.mentionId }),
            mentionRowFixture({
              id: 42,
              mappingState: 'mapped',
              rawTerm: 'Fixture Playwright',
              resolvedSkillId: seeded.playwrightId,
              resolvedSkillName: 'Fixture Playwright',
            }),
          ],
          pendingCount: 1,
        }),
        requirementSkills: [fixtureRequirementSkill],
      }),
    )
    const app = await mappingHarness()
    const response = await app.request(
      `/applications/${seeded.applicationId}/workspace?workspaceTab=review`,
    )
    const html = await response.text()

    // The success envelope's main fragment is `#skill-review-panel`, so a form
    // that swapped into any other root would nest or silently drop the panel.
    const rowForms = [
      html.match(/<form\b[^>]*\bid="skill-mention-\d+"[^>]*>/)?.[0],
      html.match(/<form\b[^>]*\bid="skill-mention-actions-\d+"[^>]*>/)?.[0],
      html.match(/<form\b[^>]*\bid="skill-mention-alias-\d+"[^>]*>/)?.[0],
    ]
    expect(rowForms.filter(Boolean)).toHaveLength(3)
    for (const form of rowForms) {
      expect(form).toContain('hx-target="#skill-review-panel"')
      expect(form).toContain('hx-swap="outerHTML"')
    }
    const decisionForms = html.match(/<form\b[^>]*hx-post="[^"]*skill-decisions[^"]*"[^>]*>/g)
    expect(decisionForms?.length).toBeGreaterThan(0)
    for (const form of decisionForms ?? []) {
      expect(form).toContain('hx-target="#skill-review-panel"')
    }
  })

  test('a mapping mutation keeps the canonical decision rows in the same fragment', async () => {
    useFixture()
    mockListRunSkillReviews.mockReturnValue([fixtureRequirementSkill])
    mockGetCandidateAnalysisState.mockReturnValue({
      ...neverRunState,
      currentCompleted: { id: 9 },
      latest: { id: 9 },
      latestCompleted: { id: 9 },
      state: 'current',
    } as never)

    const html = await (await post({ action: 'skip', mentionId: String(fixture.mentionId) })).text()

    // Replacing `#skill-review-panel` must not drop the run's decision rows.
    expect(recordsFor(html, 'skill-decision-12')).toHaveLength(1)
    expect(recordsFor(html, 'skill-readiness')).toHaveLength(1)
    expect(recordsFor(html, 'skill-mapping-panel')).toHaveLength(1)
  })
})
