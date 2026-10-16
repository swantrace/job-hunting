import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { persistJobRequirements } from '../../src/db/job-analysis'
import * as schema from '../../src/db/schema'
import { skills } from '../../src/db/schema'
import {
  CatalogSkillConflictError,
  catalogSearchLimit,
  catalogSearchMaxLimit,
  createCatalogSkill,
  loadAnalysisMapping,
  loadMentionContext,
  rememberMentionAlias,
  saveMentionMapping,
  searchApprovedCatalog,
} from '../../src/db/skill-mapping-service'
import {
  countPendingMentions,
  listAnalysisMentions,
  resetMention,
  skipMention,
} from '../../src/db/skill-mentions'
import { assessApplicationReadiness } from '../../src/lib/applications/readiness'
import { type CareerTestDatabase, createCareerTestDatabase } from '../support/career-db'

/**
 * service acceptance, on temporary databases seeded from the
 * synthetic fixtures (never `jobs.db`):
 *
 * mapping and catalog creation never fabricate candidate facts; blank input is
 * never a Skip; Remember-as-alias is an explicit single-alias opt-in; ids from a
 * request fail closed; readiness follows pending mentions; and one application's
 * Skip never hides the catalog skill globally.
 *
 * The two catalog entries the synthetic candidate does not possess mirror the
 * `catalogOnlySkills` fixture.
 */

const postingText = 'Platform engineer role using Kubernetes and Playwright.'

type Seeded = {
  target: CareerTestDatabase
  applicationId: number
  analysisId: number
  kubernetesId: number
  playwrightId: number
}

/** Inserts one approved catalog entry the candidate does not possess. */
function addCatalogOnly(
  target: CareerTestDatabase,
  entry: { key: string; name: string; category: string; aliases?: string[] },
): number {
  target.sqlite
    .query(
      `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
    VALUES (?, ?, ?, 'approved', 'career-data', '2026-10-14', '2026-10-14')`,
    )
    .run(entry.key, entry.name, entry.category)
  const skill = target.sqlite.query('SELECT id FROM skills WHERE key = ?').get(entry.key) as {
    id: number
  }
  for (const alias of entry.aliases ?? []) {
    target.sqlite
      .query(
        `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
     VALUES (?, ?, ?, 'career-data', '2026-10-14')`,
      )
      .run(skill.id, alias, alias.trim().toLowerCase())
  }
  return skill.id
}

function seedApplication(
  target: CareerTestDatabase,
  rawText: string = postingText,
  companyName = 'Example Company',
): { applicationId: number; analysisId: number } {
  const company = target.sqlite
    .query(
      'INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING id',
    )
    .get(companyName, '2026-10-14', '2026-10-14') as { id: number } | null
  const companyId =
    company?.id ??
    (
      target.sqlite.query('SELECT id FROM companies WHERE name = ?').get(companyName) as {
        id: number
      }
    ).id
  const application = target.sqlite
    .query(
      `INSERT INTO job_applications (
    company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
   ) VALUES (?, ?, 'fullstack', '2026-10-14', 'B', 'Saved', '2026-10-14', '2026-10-14') RETURNING id`,
    )
    .get(companyId, 'Platform Engineer') as { id: number }
  const posting = target.sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
    VALUES (?, ?, '2026-10-14', ?) RETURNING id`,
    )
    .get(application.id, rawText, `posting-hash-${application.id}`) as { id: number }
  const analysis = target.sqlite
    .query(
      'INSERT INTO job_posting_analyses (job_posting_id, created_at, updated_at) VALUES (?, ?, ?) RETURNING id',
    )
    .get(posting.id, '2026-10-14', '2026-10-14') as { id: number }
  return { applicationId: application.id, analysisId: analysis.id }
}

/**
 * Persists requirements with an empty supplied catalog, so every term stays
 * pending exactly as requires for an unknown or ambiguous term.
 */
function persistPending(
  target: CareerTestDatabase,
  analysisId: number,
  entries: Array<{
    term: string
    statement: string
    importance: 'required' | 'preferred' | 'mentioned'
  }>,
) {
  persistJobRequirements(
    target.executor,
    analysisId,
    entries.map((entry) => ({
      type: 'skill' as const,
      importance: entry.importance,
      basis: 'explicit' as const,
      statement: entry.statement,
      sourceText: entry.statement,
      inferenceRationale: null,
      terms: [{ term: entry.term, sourceText: entry.statement, confidence: null, key: null }],
    })),
    '2026-10-14',
    [],
  )
}

function setup(): Seeded {
  const target = createCareerTestDatabase()
  const kubernetesId = addCatalogOnly(target, {
    key: 'kubernetes',
    name: 'Kubernetes',
    category: 'cloud-devops',
  })
  const playwrightId = addCatalogOnly(target, {
    key: 'playwright',
    name: 'Playwright',
    category: 'testing-quality',
  })
  const { applicationId, analysisId } = seedApplication(target)
  persistPending(target, analysisId, [
    { term: 'Kubernetes', statement: postingText, importance: 'required' },
    { term: 'Playwright', statement: postingText, importance: 'preferred' },
  ])
  return { target, applicationId, analysisId, kubernetesId, playwrightId }
}

function mentionByTerm(seeded: Seeded, term: string) {
  const mention = listAnalysisMentions(seeded.target.executor, seeded.analysisId).find(
    (row) => row.rawTerm === term,
  )
  if (!mention) throw new Error(`Missing mention "${term}".`)
  return mention
}

function counts(seeded: Seeded) {
  const count = (table: string) =>
    (
      seeded.target.sqlite.query(`SELECT count(*) AS count FROM ${table}`).get() as {
        count: number
      }
    ).count
  return {
    skills: count('skills'),
    aliases: count('skill_aliases'),
    personal: count('career_skills'),
    junctions: count('job_requirements_to_skills'),
  }
}

function personalSkillsFor(seeded: Seeded, skillId: number) {
  return (
    seeded.target.sqlite
      .query('SELECT count(*) AS count FROM career_skills WHERE skill_id = ?')
      .get(skillId) as { count: number }
  ).count
}

function aliasesFor(seeded: Seeded, skillId: number) {
  return (
    seeded.target.sqlite
      .query('SELECT alias FROM skill_aliases WHERE skill_id = ? ORDER BY normalized_alias')
      .all(skillId) as Array<{ alias: string }>
  ).map((row) => row.alias)
}

describe('mapping a pending term to a catalog skill', () => {
  test('creates the junction and never creates a personal skill or catalog row', () => {
    const seeded = setup()
    try {
      const mention = mentionByTerm(seeded, 'Kubernetes')
      const before = counts(seeded)
      expect(before.personal).toBeGreaterThan(0)

      saveMentionMapping(seeded.target.executor, mention.id, seeded.kubernetesId)

      const mapping = loadAnalysisMapping(seeded.target.executor, seeded.analysisId)
      expect(mapping.mentions.find((row) => row.id === mention.id)).toMatchObject({
        mappingState: 'mapped',
        resolvedSkillId: seeded.kubernetesId,
        resolvedSkillKey: 'kubernetes',
        resolvedSkillName: 'Kubernetes',
      })
      expect(mapping.pendingCount).toBe(1)
      const rows = seeded.target.sqlite
        .query('SELECT raw_label FROM job_requirements_to_skills WHERE skill_id = ?')
        .all(seeded.kubernetesId)
      expect(rows).toEqual([{ raw_label: 'Kubernetes' }])

      // Mapping records which catalog skill the posting named; it never claims
      // the candidate possesses it and never rewrites the catalog.
      expect(personalSkillsFor(seeded, seeded.kubernetesId)).toBe(0)
      expect(counts(seeded)).toEqual({
        skills: before.skills,
        aliases: before.aliases,
        personal: before.personal,
        junctions: before.junctions + 1,
      })
      expect(seeded.target.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      seeded.target.cleanup()
    }
  })

  test('keeps distinct requirement sources as separate mentions of one skill', () => {
    const seeded = setup()
    try {
      const { analysisId } = seeded
      persistPending(seeded.target, analysisId, [
        { term: 'Kubernetes', statement: 'Operate Kubernetes clusters.', importance: 'required' },
        { term: 'Kubernetes', statement: 'Kubernetes upgrade ownership.', importance: 'preferred' },
      ])
      const mentions = listAnalysisMentions(seeded.target.executor, analysisId)
      expect(mentions).toHaveLength(2)
      for (const mention of mentions)
        saveMentionMapping(seeded.target.executor, mention.id, seeded.kubernetesId)

      const groups = loadAnalysisMapping(seeded.target.executor, analysisId).groups
      expect(groups).toHaveLength(1)
      expect(groups[0]).toMatchObject({ skillId: seeded.kubernetesId, importance: 'required' })
      expect(groups[0].sources).toHaveLength(2)
    } finally {
      seeded.target.cleanup()
    }
  })

  test('rejects a blank or unknown skill id without writing', () => {
    const seeded = setup()
    try {
      const mention = mentionByTerm(seeded, 'Kubernetes')
      const before = counts(seeded)
      expect(() => saveMentionMapping(seeded.target.executor, mention.id, 999_999)).toThrow()
      expect(() => saveMentionMapping(seeded.target.executor, mention.id, 0)).toThrow()
      expect(counts(seeded)).toEqual(before)
      expect(
        listAnalysisMentions(seeded.target.executor, seeded.analysisId).find(
          (row) => row.id === mention.id,
        )?.mappingState,
      ).toBe('pending')
    } finally {
      seeded.target.cleanup()
    }
  })

  test('refuses a merged or not-approved catalog target', () => {
    const seeded = setup()
    try {
      const mention = mentionByTerm(seeded, 'Kubernetes')
      seeded.target.sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at)
      VALUES ('k8s-legacy', 'K8s', 'cloud-devops', 'merged', 'job-parser', ?, '2026-10-14', '2026-10-14')`,
        )
        .run(seeded.kubernetesId)
      const merged = seeded.target.sqlite
        .query("SELECT id FROM skills WHERE key = 'k8s-legacy'")
        .get() as { id: number }
      const pendingTarget = seeded.target.sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
      VALUES ('terraform', 'Terraform', 'cloud-devops', 'pending', 'job-parser', '2026-10-14', '2026-10-14')
      RETURNING id`,
        )
        .get() as { id: number }

      expect(() => saveMentionMapping(seeded.target.executor, mention.id, merged.id)).toThrow(
        /merged/,
      )
      expect(() =>
        saveMentionMapping(seeded.target.executor, mention.id, pendingTarget.id),
      ).toThrow(/only approved/)
      expect(
        seeded.target.sqlite
          .query('SELECT count(*) AS count FROM job_requirements_to_skills')
          .get(),
      ).toEqual({ count: 0 })
    } finally {
      seeded.target.cleanup()
    }
  })
})

describe('explicit Skip and returning to pending', () => {
  test('Skip records skipped and removes any junction; blank input is not a Skip', () => {
    const seeded = setup()
    try {
      const mention = mentionByTerm(seeded, 'Kubernetes')
      saveMentionMapping(seeded.target.executor, mention.id, seeded.kubernetesId)
      expect(countPendingMentions(seeded.target.executor, seeded.analysisId)).toBe(1)

      skipMention(seeded.target.executor, mention.id)

      expect(
        listAnalysisMentions(seeded.target.executor, seeded.analysisId).find(
          (row) => row.id === mention.id,
        ),
      ).toMatchObject({ mappingState: 'skipped', resolvedSkillId: null })
      // Only the explicitly skipped term is resolved; Playwright stays pending.
      expect(countPendingMentions(seeded.target.executor, seeded.analysisId)).toBe(1)
      skipMention(seeded.target.executor, mentionByTerm(seeded, 'Playwright').id)
      expect(countPendingMentions(seeded.target.executor, seeded.analysisId)).toBe(0)
      expect(
        seeded.target.sqlite
          .query('SELECT count(*) AS count FROM job_requirements_to_skills')
          .get(),
      ).toEqual({ count: 0 })
      // The catalog entry stays approved and unchanged: Skip is per run.
      expect(
        seeded.target.sqlite
          .query('SELECT review_status FROM skills WHERE id = ?')
          .get(seeded.kubernetesId),
      ).toEqual({ review_status: 'approved' })
    } finally {
      seeded.target.cleanup()
    }
  })

  test('unmap and unskip both return a mention to pending and re-block readiness', () => {
    const seeded = setup()
    try {
      const mention = mentionByTerm(seeded, 'Kubernetes')
      const readiness = () =>
        assessApplicationReadiness({
          hasReviewedAnalysis: true,
          analysisStatus: 'completed',
          hasPendingSkillDecisions: false,
          hasPendingSkillMentions:
            countPendingMentions(seeded.target.executor, seeded.analysisId) > 0,
        })
      const blockedReason = 'Resolve every unresolved job-skill term before generating documents.'

      expect(readiness()).toEqual({ ready: false, reasons: [blockedReason] })

      saveMentionMapping(seeded.target.executor, mention.id, seeded.kubernetesId)
      expect(countPendingMentions(seeded.target.executor, seeded.analysisId)).toBe(1)

      resetMention(seeded.target.executor, mention.id)
      expect(
        listAnalysisMentions(seeded.target.executor, seeded.analysisId).find(
          (row) => row.id === mention.id,
        ),
      ).toMatchObject({ mappingState: 'pending', resolvedSkillId: null })
      expect(
        seeded.target.sqlite
          .query('SELECT count(*) AS count FROM job_requirements_to_skills')
          .get(),
      ).toEqual({ count: 0 })

      skipMention(seeded.target.executor, mention.id)
      skipMention(seeded.target.executor, mentionByTerm(seeded, 'Playwright').id)
      expect(countPendingMentions(seeded.target.executor, seeded.analysisId)).toBe(0)
      expect(readiness()).toEqual({ ready: true, reasons: [] })

      resetMention(seeded.target.executor, mention.id)
      expect(readiness()).toEqual({ ready: false, reasons: [blockedReason] })
    } finally {
      seeded.target.cleanup()
    }
  })
})

describe('explicit catalog creation', () => {
  test('creates an approved manual skill with a stable key and no personal skill or alias', () => {
    const seeded = setup()
    try {
      const before = counts(seeded)
      const id = createCatalogSkill(seeded.target.executor, {
        name: 'C++',
        category: 'languages-web',
      })

      expect(
        seeded.target.executor.select().from(skills).where(eq(skills.id, id)).get(),
      ).toMatchObject({
        key: 'c-plus-plus',
        name: 'C++',
        category: 'languages-web',
        reviewStatus: 'approved',
        origin: 'manual',
        mergedIntoSkillId: null,
      })
      expect(personalSkillsFor(seeded, id)).toBe(0)
      expect(aliasesFor(seeded, id)).toEqual([])
      expect(counts(seeded).skills).toBe(before.skills + 1)
      expect(counts(seeded).aliases).toBe(before.aliases)
      expect(counts(seeded).personal).toBe(before.personal)
    } finally {
      seeded.target.cleanup()
    }
  })

  test('reports key, alias, name and category collisions with actionable fields', () => {
    const seeded = setup()
    try {
      const attempts = [
        { input: { name: 'Kubernetes', category: 'cloud-devops' }, field: 'key' },
        { input: { name: 'K8s', category: 'cloud-devops' }, field: 'alias' },
        { input: { name: 'Not A Real Category', category: 'nope' }, field: 'category' },
        { input: { name: '  ', category: null }, field: 'name' },
      ] as const
      seeded.target.sqlite
        .query(
          `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
      VALUES (?, 'K8s', 'k8s', 'manual', '2026-10-14')`,
        )
        .run(seeded.kubernetesId)

      for (const attempt of attempts) {
        let caught: unknown
        try {
          createCatalogSkill(seeded.target.executor, attempt.input)
        } catch (error) {
          caught = error
        }
        expect(caught).toBeInstanceOf(CatalogSkillConflictError)
        expect((caught as CatalogSkillConflictError).field).toBe(attempt.field)
        expect((caught as CatalogSkillConflictError).message.length).toBeGreaterThan(0)
      }

      // A display-name collision with a different key is reported as the name.
      seeded.target.sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
      VALUES ('legacy-key', 'Legacy Name', 'cloud-devops', 'approved', 'import', '2026-10-14', '2026-10-14')`,
        )
        .run()
      expect(() =>
        createCatalogSkill(seeded.target.executor, { name: 'Legacy Name', category: null }),
      ).toThrow(/already used/)

      const failedName = (() => {
        try {
          createCatalogSkill(seeded.target.executor, { name: 'Legacy Name', category: null })
        } catch (error) {
          return error as CatalogSkillConflictError
        }
        return null
      })()
      expect(failedName?.field).toBe('name')
    } finally {
      seeded.target.cleanup()
    }
  })
})

describe('Remember as alias is an explicit single-alias opt-in', () => {
  test('mapping adds no alias, and the explicit action adds exactly one', () => {
    const seeded = setup()
    try {
      const mention = mentionByTerm(seeded, 'Kubernetes')
      const before = counts(seeded)
      saveMentionMapping(seeded.target.executor, mention.id, seeded.kubernetesId)
      expect(aliasesFor(seeded, seeded.kubernetesId)).toEqual([])
      expect(counts(seeded).aliases).toBe(before.aliases)

      rememberMentionAlias(seeded.target.executor, mention.id, 'K8s')
      expect(aliasesFor(seeded, seeded.kubernetesId)).toEqual(['K8s'])
      expect(counts(seeded).aliases).toBe(before.aliases + 1)
      expect(personalSkillsFor(seeded, seeded.kubernetesId)).toBe(0)

      // Repeating the same explicit action is idempotent, never a second alias.
      rememberMentionAlias(seeded.target.executor, mention.id, 'k8s')
      expect(counts(seeded).aliases).toBe(before.aliases + 1)
    } finally {
      seeded.target.cleanup()
    }
  })

  test('refuses an alias for an unmapped term or one owned by another skill', () => {
    const seeded = setup()
    try {
      const pending = mentionByTerm(seeded, 'Kubernetes')
      expect(() => rememberMentionAlias(seeded.target.executor, pending.id, 'K8s')).toThrow(
        /Map the term/,
      )

      saveMentionMapping(seeded.target.executor, pending.id, seeded.kubernetesId)
      seeded.target.sqlite
        .query(
          `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
      VALUES (?, 'Playwright Test', 'playwright test', 'manual', '2026-10-14')`,
        )
        .run(seeded.playwrightId)
      expect(() =>
        rememberMentionAlias(seeded.target.executor, pending.id, 'Playwright Test'),
      ).toThrow(CatalogSkillConflictError)
      expect(aliasesFor(seeded, seeded.kubernetesId)).toEqual([])
    } finally {
      seeded.target.cleanup()
    }
  })
})

describe('forged and foreign ids fail closed', () => {
  test('unknown mention ids never resolve or write', () => {
    const seeded = setup()
    try {
      const mention = mentionByTerm(seeded, 'Kubernetes')
      const before = counts(seeded)
      expect(loadMentionContext(999_999, seeded.target.executor)).toBeNull()
      expect(() =>
        saveMentionMapping(seeded.target.executor, 999_999, seeded.kubernetesId),
      ).toThrow()
      expect(() => skipMention(seeded.target.executor, 999_999)).toThrow()
      expect(() => resetMention(seeded.target.executor, 999_999)).toThrow()
      expect(() => rememberMentionAlias(seeded.target.executor, 999_999, 'K8s')).toThrow()
      expect(counts(seeded)).toEqual(before)
      expect(loadMentionContext(mention.id, seeded.target.executor)).toMatchObject({
        jobApplicationId: seeded.applicationId,
        jobPostingAnalysisId: seeded.analysisId,
        rawTerm: 'Kubernetes',
      })
    } finally {
      seeded.target.cleanup()
    }
  })
})

describe('one application’s Skip never globally hides the catalog skill', () => {
  test('skipping in application A leaves application B pending and the skill approved', () => {
    const seeded = setup()
    try {
      const other = seedApplication(seeded.target, postingText, 'Other Company')
      persistPending(seeded.target, other.analysisId, [
        { term: 'Kubernetes', statement: postingText, importance: 'required' },
      ])

      const aMention = mentionByTerm(seeded, 'Kubernetes')
      saveMentionMapping(seeded.target.executor, aMention.id, seeded.kubernetesId)
      skipMention(seeded.target.executor, aMention.id)

      const bMentions = listAnalysisMentions(seeded.target.executor, other.analysisId)
      expect(bMentions).toHaveLength(1)
      expect(bMentions[0]).toMatchObject({ rawTerm: 'Kubernetes', mappingState: 'pending' })
      expect(countPendingMentions(seeded.target.executor, other.analysisId)).toBe(1)

      const catalog = searchApprovedCatalog(seeded.target.executor, 'Kubernetes')
      expect(catalog.map((entry) => entry.key)).toContain('kubernetes')
      expect(
        seeded.target.sqlite
          .query('SELECT review_status FROM skills WHERE id = ?')
          .get(seeded.kubernetesId),
      ).toEqual({ review_status: 'approved' })
    } finally {
      seeded.target.cleanup()
    }
  })
})

describe('bounded catalog search for the selector', () => {
  test('returns only approved unmerged entries, capped and exact-match first', () => {
    const seeded = setup()
    try {
      for (let index = 0; index < 60; index += 1) {
        seeded.target.sqlite
          .query(
            `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
       VALUES (?, ?, 'testing-quality', 'approved', 'manual', '2026-10-14', '2026-10-14')`,
          )
          .run(`probe-${index}`, `Probe ${index}`)
      }
      seeded.target.sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
      VALUES ('probe-pending', 'Probe Pending', 'testing-quality', 'pending', 'job-parser', '2026-10-14', '2026-10-14')`,
        )
        .run()

      expect(searchApprovedCatalog(seeded.target.executor, 'Probe')).toHaveLength(
        catalogSearchLimit,
      )
      expect(searchApprovedCatalog(seeded.target.executor, 'Probe', 3)).toHaveLength(3)
      // A larger requested limit is still bounded by the documented cap.
      expect(searchApprovedCatalog(seeded.target.executor, 'Probe', 1000)).toHaveLength(
        catalogSearchMaxLimit,
      )
      expect(
        searchApprovedCatalog(seeded.target.executor, 'probe').map((entry) => entry.name),
      ).not.toContain('Probe Pending')

      const exact = searchApprovedCatalog(seeded.target.executor, 'Kubernetes')
      expect(exact[0]).toMatchObject({ key: 'kubernetes', name: 'Kubernetes' })

      // An alias claims the entry without any fuzzy string rewriting.
      seeded.target.sqlite
        .query(
          `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
      VALUES (?, 'Container Orchestration', 'container orchestration', 'manual', '2026-10-14')`,
        )
        .run(seeded.kubernetesId)
      expect(
        searchApprovedCatalog(seeded.target.executor, 'Container Orchestration').map(
          (entry) => entry.key,
        ),
      ).toEqual(['kubernetes'])

      // Merged entries never surface in the selector.
      seeded.target.sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at)
      VALUES ('k8s-old', 'K8s Old', 'cloud-devops', 'merged', 'job-parser', ?, '2026-10-14', '2026-10-14')`,
        )
        .run(seeded.kubernetesId)
      expect(
        searchApprovedCatalog(seeded.target.executor, 'K8s Old').map((entry) => entry.key),
      ).toEqual([])
    } finally {
      seeded.target.cleanup()
    }
  })
})
