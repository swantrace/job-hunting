import { describe, expect, test } from 'bun:test'
import { parseJobDescription } from '../../src/ai/client'
import { jobAnalysisSchema, jobAnalysisSchemaVersion } from '../../src/ai/schemas/job-analysis'
import { persistJobRequirements } from '../../src/db/job-analysis'
import {
  countPendingMentions,
  listCanonicalSkillGroups,
  listRequirementMentions,
} from '../../src/db/skill-mentions'
import { listRequirementSkillMappings } from '../../src/db/skill-queries'
import {
  buildJobAnalysisInput,
  frozenSuppliedCatalog,
  jobAnalysisInputFromContent,
} from '../../src/lib/job-analysis-input'
import { parseJobAnalysisResult } from '../../src/lib/job-analysis-result'
import {
  buildCatalogContext,
  catalogContextCategoryCandidateLimit,
} from '../../src/lib/skills/catalog-context'
import { normalizeSkillAlias } from '../../src/lib/skills/normalize'
import { resolveRequirementTerms } from '../../src/lib/skills/resolver'
import { type CareerTestDatabase, createCareerTestDatabase } from '../support/career-db'
import { syntheticRequirementTerms } from './fixtures'

/**
 * acceptance: catalog-grounded JD resolution.
 *
 * The JD parser only owns raw requirement terms. A deterministic, server-side
 * resolver maps a term to a catalog entry only through an exact key, a curated
 * alias or a verified catalog match; unknown, ambiguous and broad terms stay
 * pending, and resolution never creates a catalog record or personal evidence.
 *
 * Every case runs against a temporary database seeded from the
 * synthetic fixtures (never `jobs.db`).
 */

/** Adds one approved catalog entry the synthetic career dataset does not have. */
function addApprovedSkill(
  target: CareerTestDatabase,
  entry: { key: string; name: string; category: string; aliases?: string[] },
) {
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
      .run(skill.id, alias, normalizeSkillAlias(alias))
  }
  return skill.id
}

/**
 * The synthetic raw posting. Retrieval reads only this text, so every fixture
 * term must be grounded in the post itself — exactly how a real run works.
 */
const syntheticPostText = syntheticRequirementTerms
  .map((entry) => `${entry.statement} ${entry.sourceText}`)
  .join(' ')

function seedPosting(target: CareerTestDatabase, rawText: string = syntheticPostText): number {
  const company = target.sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Example Company', '2026-10-14', '2026-10-14') as { id: number }
  const application = target.sqlite
    .query(
      `INSERT INTO job_applications (
    company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
   ) VALUES (?, ?, 'fullstack', '2026-10-14', 'B', 'Saved', '2026-10-14', '2026-10-14') RETURNING id`,
    )
    .get(company.id, 'Platform Engineer') as { id: number }
  const posting = target.sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
    VALUES (?, ?, '2026-10-14', ?) RETURNING id`,
    )
    .get(application.id, rawText, 'posting-hash') as { id: number }
  const analysis = target.sqlite
    .query(
      'INSERT INTO job_posting_analyses (job_posting_id, created_at, updated_at) VALUES (?, ?, ?) RETURNING id',
    )
    .get(posting.id, '2026-10-14', '2026-10-14') as { id: number }
  return analysis.id
}

function fixture(term: string) {
  const found = syntheticRequirementTerms.find((entry) => entry.term === term)
  if (!found) throw new Error(`Missing synthetic requirement term "${term}".`)
  return found
}

/** Catalog and personal row counts; resolution must never change these. */
function counts(target: CareerTestDatabase) {
  const count = (table: string) =>
    (target.sqlite.query(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count
  return {
    skills: count('skills'),
    aliases: count('skill_aliases'),
    personal: count('career_skills'),
  }
}

/** A seeded catalog plus the two entries the synthetic dataset does not ship. */
function resolveDatabase() {
  const target = createCareerTestDatabase()
  addApprovedSkill(target, {
    key: 'code-review',
    name: 'Code Review',
    category: 'testing-quality',
    aliases: ['Code Reviews'],
  })
  addApprovedSkill(target, { key: 'openapi', name: 'OpenAPI', category: 'backend-apis' })
  return target
}

/**
 * The bounded catalog one run supplies. It is retrieved from the raw posting
 * text only — never from the model's own terms — and is what both the prompt and
 * persistence use for that run.
 */
function frozenContext(target: CareerTestDatabase) {
  return buildCatalogContext(target.executor, { text: syntheticPostText })
}

function requirementInput(entry: (typeof syntheticRequirementTerms)[number]) {
  return {
    type: entry.requirementType,
    importance: entry.importance,
    basis: 'explicit' as const,
    statement: entry.statement,
    sourceText: entry.sourceText,
    inferenceRationale: null,
    terms: [{ term: entry.term, sourceText: entry.sourceText, confidence: null, key: null }],
  }
}

describe('deterministic requirement term resolution', () => {
  test('covers every synthetic acceptance expectation', () => {
    const target = resolveDatabase()
    try {
      const catalog = frozenContext(target).entries
      const resolveOne = (term: string, key: string | null = null) =>
        resolveRequirementTerms({
          terms: [{ term, sourceText: `${term} source`, key }],
          catalog,
        })

      for (const entry of syntheticRequirementTerms) {
        const mentions = resolveOne(entry.term)
        const mapped = mentions.filter((mention) => mention.state === 'mapped')
        switch (entry.expectation) {
          case 'composite-split':
            expect(mentions).toHaveLength(2)
            expect(mapped).toHaveLength(2)
            break
          case 'curated-alias':
            expect(mapped.map((mention) => mention.skillKey)).toEqual(['javascript'])
            break
          case 'duplicate-occurrence':
            expect(mapped.map((mention) => mention.skillKey)).toEqual(['code-review'])
            break
          case 'catalog-category':
            expect(mapped.map((mention) => mention.skillKey)).toEqual(['openapi'])
            break
          case 'ambiguous-pending':
          case 'unknown-pending':
          case 'broad-concept':
            expect(mentions).toHaveLength(1)
            expect(mentions[0].state).toBe('pending')
            expect(mentions[0].skillKey).toBeUndefined()
            break
        }
      }

      expect(resolveOne('JavaScript and TypeScript').map((mention) => mention.skillKey)).toEqual([
        'javascript',
        'typescript',
      ])
      expect(resolveOne('TypeScript and JavaScript').map((mention) => mention.skillKey)).toEqual([
        'javascript',
        'typescript',
      ])
    } finally {
      target.cleanup()
    }
  })

  test('stays pending when more than one catalog entry claims the same term', () => {
    const target = resolveDatabase()
    try {
      addApprovedSkill(target, {
        key: 'graphql-api',
        name: 'GraphQL API',
        category: 'backend-apis',
        aliases: ['REST APIs'],
      })
      const catalog = buildCatalogContext(target.executor, { terms: ['REST APIs'] }).entries
      // Both claiming entries are present; the same-category cap may add more.
      expect(catalog.map((entry) => entry.key)).toContain('graphql-api')
      expect(catalog.map((entry) => entry.key)).toContain('rest-api')
      const mentions = resolveRequirementTerms({ terms: [{ term: 'REST APIs' }], catalog })
      expect(mentions).toHaveLength(1)
      expect(mentions[0].state).toBe('pending')
    } finally {
      target.cleanup()
    }
  })

  test('keeps the same two catalog ids for either composite ordering', () => {
    const target = resolveDatabase()
    try {
      const analysisId = seedPosting(target)
      persistJobRequirements(
        target.executor,
        analysisId,
        [fixture('JavaScript and TypeScript'), fixture('TypeScript and JavaScript')].map(
          (entry, index) => ({
            ...requirementInput(entry),
            statement: `${entry.statement} (${index})`,
          }),
        ),
        '2026-10-14',
        frozenContext(target).entries,
      )

      const mappings = listRequirementSkillMappings(analysisId, target.executor)
      const byRequirement = new Map<number, number[]>()
      for (const mapping of mappings) {
        const list = byRequirement.get(mapping.requirementId) ?? []
        list.push(mapping.skillId)
        byRequirement.set(mapping.requirementId, list)
      }
      const orderings = [...byRequirement.values()]
      expect(orderings).toHaveLength(2)
      expect(orderings[0]).toHaveLength(2)
      expect(orderings[0]).toEqual(orderings[1])
      expect(mappings.map((mapping) => mapping.skillKey).sort()).toEqual([
        'javascript',
        'javascript',
        'typescript',
        'typescript',
      ])
      expect(countPendingMentions(target.executor, analysisId)).toBe(0)
    } finally {
      target.cleanup()
    }
  })

  test('resolves the curated ES6 alias to JavaScript without creating an alias row', () => {
    const target = resolveDatabase()
    try {
      const analysisId = seedPosting(target)
      const before = counts(target)
      persistJobRequirements(
        target.executor,
        analysisId,
        [
          {
            type: 'skill',
            importance: 'preferred',
            basis: 'explicit',
            statement: fixture('ES6').statement,
            sourceText: fixture('ES6').sourceText,
            inferenceRationale: null,
            terms: [{ term: 'ES6', sourceText: fixture('ES6').sourceText, confidence: 0.9 }],
          },
        ],
        '2026-10-14',
        frozenContext(target).entries,
      )
      const mappings = listRequirementSkillMappings(analysisId, target.executor)
      expect(mappings).toHaveLength(1)
      expect(mappings[0]).toMatchObject({
        skillKey: 'javascript',
        rawLabel: 'ES6',
        confidence: 0.9,
      })
      expect(counts(target)).toEqual(before)
    } finally {
      target.cleanup()
    }
  })

  test('leaves ambiguous, unknown and broad terms pending with no catalog growth', () => {
    const target = resolveDatabase()
    try {
      const analysisId = seedPosting(target)
      const before = counts(target)
      persistJobRequirements(
        target.executor,
        analysisId,
        [fixture('API Integration'), fixture('Frontend Development'), fixture('OAuth')].map(
          requirementInput,
        ),
        '2026-10-14',
        frozenContext(target).entries,
      )
      expect(listRequirementSkillMappings(analysisId, target.executor)).toEqual([])
      expect(countPendingMentions(target.executor, analysisId)).toBe(3)
      expect(counts(target)).toEqual(before)
    } finally {
      target.cleanup()
    }
  })

  test('groups repeated Code Review mentions into one skill row keeping every source', () => {
    const target = resolveDatabase()
    try {
      const analysisId = seedPosting(target)
      persistJobRequirements(
        target.executor,
        analysisId,
        [
          {
            type: 'skill',
            importance: 'mentioned',
            basis: 'explicit',
            statement: 'Code review participation.',
            sourceText: 'Participate in code review.',
            inferenceRationale: null,
            terms: [
              { term: 'Code Review', sourceText: 'Participate in code review.', confidence: 0.7 },
            ],
          },
          {
            type: 'skill',
            importance: 'required',
            basis: 'explicit',
            statement: 'Review pull requests.',
            sourceText: 'Review pull requests from the team.',
            inferenceRationale: null,
            terms: [
              {
                term: 'Code Review',
                sourceText: 'Review pull requests from the team.',
                confidence: 0.8,
              },
            ],
          },
        ],
        '2026-10-14',
        frozenContext(target).entries,
      )

      const groups = listCanonicalSkillGroups(target.executor, analysisId)
      expect(groups).toHaveLength(1)
      expect(groups[0]).toMatchObject({ skillKey: 'code-review', importance: 'required' })
      expect(groups[0].sources).toHaveLength(2)
      expect(groups[0].sources.map((source) => source.requirementStatement).sort()).toEqual([
        'Code review participation.',
        'Review pull requests.',
      ])

      // Distinct requirement statements stay distinct requirement-owned mentions.
      const requirements = target.sqlite
        .query('SELECT id FROM job_requirements ORDER BY sequence')
        .all() as Array<{ id: number }>
      expect(listRequirementMentions(target.executor, requirements[0].id)).toHaveLength(1)
      expect(listRequirementMentions(target.executor, requirements[1].id)).toHaveLength(1)
      expect(listRequirementMentions(target.executor, requirements[0].id)[0].rawTerm).toBe(
        'Code Review',
      )
    } finally {
      target.cleanup()
    }
  })

  test('keeps every distinct occurrence of a term repeated inside one requirement', () => {
    const target = resolveDatabase()
    try {
      const mentions = resolveRequirementTerms({
        terms: [
          { term: 'Code Review', sourceText: 'First mention.', confidence: 0.5 },
          { term: 'code review', sourceText: 'Second mention.', confidence: 0.6 },
        ],
        catalog: frozenContext(target).entries,
      })
      expect(mentions).toHaveLength(1)
      expect(mentions[0].state).toBe('mapped')
      expect(mentions[0].occurrences).toHaveLength(2)
      expect(mentions[0].occurrences.map((occurrence) => occurrence.context)).toEqual([
        'First mention.',
        'Second mention.',
      ])
    } finally {
      target.cleanup()
    }
  })

  test('resolves OpenAPI through its approved catalog entry', () => {
    const target = resolveDatabase()
    try {
      const analysisId = seedPosting(target)
      persistJobRequirements(
        target.executor,
        analysisId,
        [requirementInput(fixture('OpenAPI'))],
        '2026-10-14',
        frozenContext(target).entries,
      )
      const mappings = listRequirementSkillMappings(analysisId, target.executor)
      expect(mappings).toHaveLength(1)
      expect(mappings[0]).toMatchObject({ skillKey: 'openapi', category: 'backend-apis' })
    } finally {
      target.cleanup()
    }
  })
})

describe('forged and unknown model keys', () => {
  test('ignores a proposed key that is not in the frozen snapshot', () => {
    const target = resolveDatabase()
    try {
      const mentions = resolveRequirementTerms({
        terms: [
          { term: 'Kubernetes', sourceText: 'Runs Kubernetes.', key: 'kubernetes' },
          { term: 'API Integration', sourceText: 'Integrates APIs.', key: 'rest-api' },
        ],
        // Nothing this run supplied was verified into the snapshot.
        catalog: [],
      })
      expect(mentions.map((mention) => mention.state)).toEqual(['pending', 'pending'])
      expect(mentions.every((mention) => mention.skillKey === undefined)).toBe(true)
    } finally {
      target.cleanup()
    }
  })

  test('never creates a catalog record from a forged key during persistence', () => {
    const target = resolveDatabase()
    try {
      const analysisId = seedPosting(target)
      const before = counts(target)
      // `sqlite` is a real approved catalog entry, but this posting never
      // retrieved it, so a proposed key naming it must be ignored.
      const supplied = buildCatalogContext(target.executor, { text: 'We run Kubernetes.' }).entries
      expect(supplied.map((entry) => entry.key)).not.toContain('sqlite')
      persistJobRequirements(
        target.executor,
        analysisId,
        [
          {
            type: 'skill',
            importance: 'required',
            basis: 'explicit',
            statement: 'Runs Kubernetes and SQLite.',
            sourceText: 'Runs Kubernetes and SQLite.',
            inferenceRationale: null,
            terms: [
              { term: 'Kubernetes', sourceText: 'Runs Kubernetes.', key: 'kubernetes' },
              { term: 'SQLite work', sourceText: 'SQLite.', key: 'sqlite' },
            ],
          },
        ],
        '2026-10-14',
        supplied,
      )
      expect(listRequirementSkillMappings(analysisId, target.executor)).toEqual([])
      expect(countPendingMentions(target.executor, analysisId)).toBe(2)
      expect(counts(target)).toEqual(before)
      expect(
        target.sqlite.query("SELECT count(*) AS count FROM skills WHERE key = 'kubernetes'").get(),
      ).toEqual({ count: 0 })
    } finally {
      target.cleanup()
    }
  })

  test('honours a key proposed for an entry retrieved from the raw text', () => {
    const target = resolveDatabase()
    try {
      const catalog = buildCatalogContext(target.executor, {
        text: 'We author OpenAPI specifications.',
      }).entries
      expect(catalog.map((entry) => entry.key)).toContain('openapi')
      const mentions = resolveRequirementTerms({
        terms: [{ term: 'OpenAPI specification', sourceText: 'Authors specs.', key: 'openapi' }],
        catalog,
      })
      expect(mentions).toHaveLength(1)
      expect(mentions[0]).toMatchObject({ state: 'mapped', skillKey: 'openapi' })
    } finally {
      target.cleanup()
    }
  })
})

describe('empty and bounded catalogs', () => {
  test('an empty catalog yields unresolved terms without failing or growing the catalog', () => {
    const target = createCareerTestDatabase({ seed: false })
    try {
      const analysisId = seedPosting(target)
      const before = counts(target)
      const context = frozenContext(target)
      expect(context.entries).toEqual([])
      expect(context.truncated).toBe(false)

      persistJobRequirements(
        target.executor,
        analysisId,
        [fixture('JavaScript and TypeScript'), fixture('ES6'), fixture('OpenAPI')].map(
          requirementInput,
        ),
        '2026-10-14',
        frozenContext(target).entries,
      )

      expect(listRequirementSkillMappings(analysisId, target.executor)).toEqual([])
      expect(countPendingMentions(target.executor, analysisId)).toBeGreaterThan(0)
      expect(counts(target)).toEqual(before)
      expect(listCanonicalSkillGroups(target.executor, analysisId)).toEqual([])
      expect(target.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      target.cleanup()
    }
  })

  test('freezes a bounded context whose fingerprint ignores posting word order', () => {
    const target = resolveDatabase()
    try {
      const forward = buildCatalogContext(target.executor, {
        text: 'JavaScript and TypeScript required.',
      })
      const reversed = buildCatalogContext(target.executor, {
        text: 'TypeScript and JavaScript required.',
      })
      expect(forward.fingerprint).toBe(reversed.fingerprint)
      expect(forward.entries.map((entry) => entry.key)).toEqual(
        reversed.entries.map((entry) => entry.key),
      )
      expect(forward.entries.map((entry) => entry.key)).toEqual(['javascript', 'typescript'])
      expect(forward.truncated).toBe(false)
    } finally {
      target.cleanup()
    }
  })

  test('retrieves bounded candidates from raw text by word, bigram, alias and key', () => {
    const target = resolveDatabase()
    try {
      // Every category here has exactly the entries the text names, so the
      // retrieved set is exact (no category candidate is added).
      const exact = buildCatalogContext(target.executor, {
        text: 'Strong TypeScript and ES6 experience; React.js.',
      })
      expect(exact.entries.map((entry) => entry.key)).toEqual(['javascript', 'react', 'typescript'])
      expect(exact.truncated).toBe(false)

      // Bigram and key wording are retrieved deterministically; same-category
      // candidates may legitimately extend the set.
      const broad = buildCatalogContext(target.executor, {
        text: 'REST APIs, SQLite and rest-api ownership.',
      })
      const broadKeys = broad.entries.map((entry) => entry.key)
      expect(broadKeys).toContain('rest-api')
      expect(broadKeys).toContain('sqlite')
      expect(broadKeys).not.toContain('typescript')

      // Sentence punctuation is trimmed exactly, never fuzzy-matched.
      expect(
        buildCatalogContext(target.executor, { text: 'Familiar with React.' }).entries.map(
          (entry) => entry.key,
        ),
      ).toContain('react')
      // An unrelated posting retrieves nothing rather than the whole catalog.
      expect(buildCatalogContext(target.executor, { text: 'Bakery shift lead.' }).entries).toEqual(
        [],
      )
    } finally {
      target.cleanup()
    }
  })

  test('caps same-category candidates and reports truncation', () => {
    const target = resolveDatabase()
    try {
      for (let index = 0; index < 12; index += 1) {
        addApprovedSkill(target, {
          key: `probe-${index}`,
          name: `Probe ${index}`,
          category: 'testing-quality',
        })
      }
      const context = buildCatalogContext(target.executor, {
        text: 'Participate in code review.',
      })
      expect(context.entries[0]).toMatchObject({ key: 'code-review' })
      expect(context.truncated).toBe(true)
      expect(context.entries.length).toBe(1 + catalogContextCategoryCandidateLimit)
    } finally {
      target.cleanup()
    }
  })

  test('supplies an empty catalog when the raw post matches nothing and still completes', () => {
    const target = resolveDatabase()
    try {
      const rawText = 'We are a bakery hiring a baker.'
      const analysisId = seedPosting(target, rawText)
      const identity = jobAnalysisInputFromContent('posting-hash', rawText, target.executor)
      expect(identity.snapshot.suppliedCatalog.entries).toEqual([])
      expect(identity.snapshot.suppliedCatalog.truncated).toBe(false)

      persistJobRequirements(
        target.executor,
        analysisId,
        [requirementInput(fixture('OpenAPI'))],
        '2026-10-14',
        frozenSuppliedCatalog(JSON.stringify(identity.snapshot)),
      )
      expect(listRequirementSkillMappings(analysisId, target.executor)).toEqual([])
      expect(countPendingMentions(target.executor, analysisId)).toBe(1)
      expect(target.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      target.cleanup()
    }
  })

  test('freezes one supplied set that the prompt and resolution both consume', () => {
    const target = resolveDatabase()
    try {
      const analysisId = seedPosting(target)
      const identity = jobAnalysisInputFromContent(
        'posting-hash',
        syntheticPostText,
        target.executor,
      )
      const supplied = frozenSuppliedCatalog(JSON.stringify(identity.snapshot))
      expect(supplied).toEqual(identity.snapshot.suppliedCatalog.entries)
      expect(supplied.map((entry) => entry.key)).toEqual(
        frozenContext(target).entries.map((entry) => entry.key),
      )
      expect(supplied.map((entry) => entry.key)).toContain('openapi')

      // The enqueue path freezes the same set from the posting row's raw text.
      const postingId = (
        target.sqlite.query('SELECT id FROM job_postings ORDER BY id DESC LIMIT 1').get() as {
          id: number
        }
      ).id
      const built = buildJobAnalysisInput(target.executor, postingId)
      expect(built?.snapshot.suppliedCatalog.entries).toEqual(supplied)

      // Persisting with the frozen set resolves exactly what the prompt allowed.
      persistJobRequirements(
        target.executor,
        analysisId,
        [requirementInput(fixture('OpenAPI')), requirementInput(fixture('OAuth'))],
        '2026-10-14',
        supplied,
      )
      expect(
        listRequirementSkillMappings(analysisId, target.executor).map(
          (mapping) => mapping.skillKey,
        ),
      ).toEqual(['openapi'])
      expect(countPendingMentions(target.executor, analysisId)).toBe(1)
    } finally {
      target.cleanup()
    }
  })

  test('sends exactly the supplied entries to the paid prompt, never the whole catalog', async () => {
    const target = resolveDatabase()
    const originalFetch = globalThis.fetch
    try {
      const rawText = 'We build React clients.'
      const supplied = buildCatalogContext(target.executor, { text: rawText }).entries
      // React's category has no other approved entry, so this set is exact.
      expect(supplied.map((entry) => entry.key)).toEqual(['react'])

      const bodies: Array<{ input: Array<{ role: string; content: string }> }> = []
      globalThis.fetch = (async (_url: unknown, init: { body?: string } = {}) => {
        bodies.push(JSON.parse(String(init.body)) as (typeof bodies)[number])
        return { ok: true, json: async () => ({ output_text: 'not a job analysis' }) } as Response
      }) as unknown as typeof fetch

      await parseJobDescription({ OPENAI_API_KEY: 'test-key' }, rawText, supplied).catch(
        () => undefined,
      )

      const system = bodies[0].input.find((message) => message.role === 'system')?.content
      expect(system).toContain('- key: react | name: React | category: frontend')
      expect(system).not.toContain('- key: sqlite')
      expect(system).not.toContain('- key: typescript')
      expect(system).not.toContain('- key: openapi')
      expect(system).not.toContain('- key: code-review')

      // An empty supplied set says so explicitly instead of implying a catalog.
      const emptyBodies: Array<{ input: Array<{ role: string; content: string }> }> = []
      globalThis.fetch = (async (_url: unknown, init: { body?: string } = {}) => {
        emptyBodies.push(JSON.parse(String(init.body)) as (typeof emptyBodies)[number])
        return { ok: true, json: async () => ({ output_text: 'not a job analysis' }) } as Response
      }) as unknown as typeof fetch
      await parseJobDescription(
        { OPENAI_API_KEY: 'test-key' },
        'We are a bakery hiring a baker.',
        [],
      ).catch(() => undefined)
      expect(emptyBodies[0].input.find((message) => message.role === 'system')?.content).toContain(
        'Approved catalog entries supplied for this posting: none.',
      )
    } finally {
      globalThis.fetch = originalFetch
      target.cleanup()
    }
  })
})

describe('stored analysis contracts', () => {
  test('keeps a legacy skill-reference analysis readable without crashing', () => {
    const legacy = {
      summary: { rolePurpose: 'Build services.', idealCandidate: 'An engineer.' },
      classification: {
        roleType: 'backend',
        advertisedSeniority: 'intermediate',
        practicalSeniority: 'strong-mid',
        rationale: 'Services ownership.',
        functionalEmphasis: {
          frontend: 0,
          backend: 50,
          testingQuality: 15,
          devopsInfrastructure: 20,
          collaborationOwnership: 15,
        },
      },
      requirements: [
        {
          type: 'skill',
          importance: 'required',
          basis: 'explicit',
          statement: 'Kafka experience.',
          sourceText: 'Kafka experience',
          inferenceRationale: null,
          skillReferences: [
            {
              rawLabel: 'Apache Kafka',
              canonicalLabel: 'Kafka',
              category: 'messaging-async',
              confidence: 0.96,
            },
          ],
        },
      ],
      painPoints: [],
      culture: [],
      redFlags: [],
      successMetrics: [],
      benefits: [],
      notes: null,
      interviewQuestions: [],
    }
    const parsed = parseJobAnalysisResult(JSON.stringify(legacy))
    expect(parsed?.requirements[0].terms).toEqual([
      { term: 'Apache Kafka', sourceText: null, confidence: 0.96, key: null },
    ])
    expect(parseJobAnalysisResult('not json')).toBeNull()
    expect(parseJobAnalysisResult(null)).toBeNull()
  })

  test('no longer accepts the v4 per-requirement skill references', () => {
    expect(jobAnalysisSchemaVersion).toBe('5.0.0')
    const current = jobAnalysisSchema.safeParse({
      summary: { rolePurpose: 'Build services.', idealCandidate: 'An engineer.' },
      classification: {
        roleType: 'backend',
        advertisedSeniority: 'intermediate',
        practicalSeniority: 'strong-mid',
        rationale: 'Services ownership.',
        functionalEmphasis: {
          frontend: 0,
          backend: 50,
          testingQuality: 15,
          devopsInfrastructure: 20,
          collaborationOwnership: 15,
        },
      },
      requirements: [
        {
          type: 'skill',
          importance: 'required',
          basis: 'explicit',
          statement: 'Kafka experience.',
          sourceText: 'Kafka experience',
          inferenceRationale: null,
          skillReferences: [],
        },
      ],
      painPoints: [],
      culture: [],
      redFlags: [],
      successMetrics: [],
      benefits: [],
      notes: null,
      interviewQuestions: [],
    })
    expect(current.success).toBe(false)
  })
})
