import { describe, expect, test } from 'bun:test'
import { approveBaseResumeVersion, createBaseResumeDraft } from '../../src/db/career-base-resumes'
import {
  buildChatGptContextJson,
  chatGptContextFormat,
  chatGptContextSchemaVersion,
  previewChatGptContext,
  serializeChatGptContext,
} from '../../src/lib/career/chatgpt-context'
import { createCareerTestDatabase } from '../support/career-db'

/**
 * acceptance for the database-owned JSON ChatGPT context.
 *
 * Each test builds a temporary migrated database outside the repository and
 * seeds the synthetic fixtures through the importer, so the developer's
 * `jobs.db` and private `career-data/` are never touched.
 */

const privateProjectUrl = 'https://example.test/synthetic-tracker'
const privatePublicationUrl = 'https://example.test/preprints/synthetic'

type Executor = ReturnType<typeof createCareerTestDatabase>['executor']

function withDatabase<T>(run: (executor: Executor) => T): T {
  const database = createCareerTestDatabase()
  try {
    return run(database.executor)
  } finally {
    database.cleanup()
  }
}

/** Serialized output, so privacy assertions inspect the exact downloaded bytes. */
function serialize(
  executor: Executor,
  options: Parameters<typeof buildChatGptContextJson>[1] = {},
) {
  return serializeChatGptContext(buildChatGptContextJson(executor, options))
}

describe('ChatGPT JSON career context', () => {
  test('produces ONE parseable JSON document with safe facts, rules and source identities', () => {
    withDatabase((executor) => {
      const context = buildChatGptContextJson(executor)
      expect(context.format).toBe(chatGptContextFormat)
      expect(context.schemaVersion).toBe(chatGptContextSchemaVersion)

      const parsed = JSON.parse(serializeChatGptContext(context)) as typeof context
      const safeFacts = parsed.safeFacts as Record<string, unknown>
      const identities = parsed.sourceIdentities as Record<string, unknown>
      const directions = parsed.directions as Array<Record<string, unknown>>

      // Safe facts: the reporting achievement is present, the unsafe one is not.
      const achievements = safeFacts.achievements as Array<{ id: string }>
      expect(achievements.map((item) => item.id)).toContain('reporting-api-delivery')
      expect(JSON.stringify(safeFacts)).not.toContain('unverified-claim')
      expect(JSON.stringify(safeFacts)).not.toContain('Unsafe synthetic claim')

      // Effective rules and evidence index per direction.
      expect(directions).toHaveLength(1)
      const effectiveRules = directions[0]?.effectiveRules as Record<string, unknown>
      expect(effectiveRules.resume).toMatchObject({ maxWords: expect.any(Number) })
      expect(directions[0]?.evidenceIndex).toMatchObject({
        achievementIds: ['reporting-api-delivery'],
        projectIds: ['synthetic-tracker'],
      })

      // Source identities bind the computed career-content fingerprint, the
      // dataset format and the approved Base Resume the export actually used.
      expect(identities.database).toMatchObject({
        contentFingerprint: expect.any(String),
        updatedAt: expect.any(String),
      })
      expect(identities.careerDataset).toMatchObject({ format: 'career-dataset' })
      expect(identities.baseResumes).toEqual([
        expect.objectContaining({ directionKey: 'fullstack', version: 'v1' }),
      ])
      const resumes = parsed.approvedBaseResumes as Array<Record<string, unknown>>
      expect(resumes).toHaveLength(1)
      expect(resumes[0]?.markdown).toContain('Jordan Rivera')

      // A full export states which directions were omitted for lack of a resume.
      expect(parsed.notExported).toEqual({ directionKeys: ['frontend', 'fhir'] })

      // The logical limits are stated in the payload itself.
      expect((parsed.excluded as Record<string, unknown>).kinds).toContain('oauth-credentials')
    })
  })

  test('excludes contact details and private URLs by default', () => {
    withDatabase((executor) => {
      const json = serialize(executor)
      expect(json).not.toContain('jordan.rivera@example.test')
      expect(json).not.toContain('+1-555-0100')
      expect(json).not.toContain('Edmonton')
      expect(json).not.toContain('https://example.test/jordan-rivera')
      expect(json).not.toContain(privateProjectUrl)
      expect(json).not.toContain(privatePublicationUrl)
      // The name and the factual career rules are safe facts and stay.
      expect(json).toContain('Jordan Rivera')
      expect(json).toContain('deliberately excluded')
    })
  })

  test('includes contact details and private URLs only when explicitly opted in', () => {
    withDatabase((executor) => {
      const json = serialize(executor, { includeSourceUrls: true, includeContactDetails: true })
      expect(json).toContain('jordan.rivera@example.test')
      expect(json).toContain(privateProjectUrl)
      expect(json).toContain(privatePublicationUrl)
      expect(json).not.toContain('deliberately excluded')
      const parsed = JSON.parse(json) as { sourceIdentities: { privacy: unknown } }
      expect(parsed.sourceIdentities.privacy).toEqual({
        includeSourceUrls: true,
        includeContactDetails: true,
      })
    })
  })

  test('never leaks OAuth credentials, refresh tokens or filesystem paths', () => {
    withDatabase((executor) => {
      const json = serialize(executor, { includeSourceUrls: true, includeContactDetails: true })
      for (const token of [
        'access_token',
        'refresh_token',
        'client_secret',
        'private_key',
        'Bearer ',
        process.cwd(),
      ]) {
        expect(json).not.toContain(token)
      }
    })
  })

  test('a direction-scoped export keeps that direction and its sources', () => {
    withDatabase((executor) => {
      // The synthetic preferences define a `frontend` direction; give it its own
      // approved Base Resume so a multi-direction database can be scoped.
      const draft = createBaseResumeDraft(executor, {
        directionKey: 'frontend',
        version: 'v1',
        markdown: '# Jordan Rivera\n\n## Summary\n\nSynthetic frontend base resume.\n',
      })
      approveBaseResumeVersion(executor, draft.id)

      const scoped = buildChatGptContextJson(executor, { directionKey: 'frontend' })
      expect(scoped.scope).toEqual({ kind: 'direction', directionKey: 'frontend' })
      const identities = scoped.sourceIdentities as Record<string, unknown>
      expect(identities.baseResumes).toEqual([
        expect.objectContaining({ directionKey: 'frontend' }),
      ])
      const safeFacts = scoped.safeFacts as Record<string, unknown>
      // The achievement is tagged for both directions, so it is in scope; the
      // unsafe frontend-only claim is excluded wherever it appears.
      expect((safeFacts.achievements as Array<{ id: string }>).map((item) => item.id)).toEqual([
        'reporting-api-delivery',
      ])
      expect(JSON.stringify(safeFacts)).not.toContain('unverified-claim')
      expect((scoped.directions as Array<Record<string, unknown>>)[0]).toMatchObject({
        direction: { key: 'frontend', label: 'Frontend Developer' },
      })

      // The full export contains both directions and both Base Resumes.
      const full = buildChatGptContextJson(executor)
      expect((full.directions as unknown[]).length).toBe(2)
      expect((full.approvedBaseResumes as unknown[]).length).toBe(2)
    })
  })

  test('preview reports counts and the directions that lack an approved Base Resume', () => {
    withDatabase((executor) => {
      const preview = previewChatGptContext(executor)
      expect(preview.directionsMissingBaseResume).toEqual(['frontend', 'fhir'])
      expect(preview.counts.safeAchievements).toBe(1)
      expect(preview.counts.eligibleProjects).toBe(1)
      expect(preview.counts.safePublications).toBe(1)
      expect(preview.directions.map((direction) => direction.key)).toEqual([
        'fullstack',
        'frontend',
        'fhir',
      ])
    })
  })

  test('the same database state always produces the same safe-facts hash', () => {
    withDatabase((executor) => {
      const first = buildChatGptContextJson(executor)
      const second = buildChatGptContextJson(executor)
      const hashOf = (context: Record<string, unknown>) =>
        (context.sourceIdentities as Record<string, unknown>).canonicalSafeFactsHash
      expect(hashOf(first)).toBe(hashOf(second))
      // Opting into private URLs changes the identity of what is exported.
      const optedIn = buildChatGptContextJson(executor, { includeSourceUrls: true })
      expect(hashOf(optedIn)).not.toBe(hashOf(first))
    })
  })
})
