import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { resumeDraftSystemPromptFor } from '../../src/ai/prompts/document-draft'
import {
  approveBaseResumeVersion,
  createBaseResumeDraft,
  listBaseResumeVersions,
  selectedApprovedBaseResume,
} from '../../src/db/career-base-resumes'
import {
  createCareerDirection,
  readCareerDirection,
  updateCareerDirection,
} from '../../src/db/career-directions'
import { canonicalHash } from '../../src/lib/canonical-hash'
import { baseResumeTextHash } from '../../src/lib/career/base-resumes'
import {
  directionFormSchema,
  directionFormValues,
  directionRulesFromForm,
} from '../../src/lib/career/form-input'
import type { DocumentDraft } from '../../src/lib/document-draft'
import {
  baseResumeIdentity,
  baseResumeSourceFor,
  buildDocumentDraftSnapshot,
  directionDocumentPolicy,
} from '../../src/lib/document-draft-input'
import {
  documentDraftPolicy,
  effectiveDocumentDraftPolicy,
} from '../../src/lib/document-draft-policy'
import { validateDocumentDraft } from '../../src/lib/document-draft-validation'
import { generationStalenessReasons } from '../../src/lib/generation-input'
import { type CareerTestDatabase, createCareerTestDatabase } from '../support/career-db'

/**
 * data-level contracts: a direction's stored bounded rules are the
 * effective source for both drafting and deterministic validation, they are
 * part of the document freshness identity, and the Base Resume draft/approval
 * lifecycle snapshots immutable content.
 */

const baseResumeMarkdown = `# Jordan Rivera

## Summary

Synthetic approved Base Resume. Delivered a reporting API.
`

let database: CareerTestDatabase

beforeAll(() => {
  database = createCareerTestDatabase()
})

afterAll(() => {
  database.cleanup()
})

function executor() {
  return database.executor
}

const applicationSource = {
  application: {
    id: 1,
    direction: 'career-step10-rules',
    jobTitle: 'Staff Engineer',
    location: null,
    url: null,
  },
  company: { name: 'Synthetic Co' },
  jobPosting: undefined,
  jobRequirements: [],
  requirements: [],
}

describe('effective direction generation rules', () => {
  test('a direction without stored rules uses the documented seed/default budgets', () => {
    expect(effectiveDocumentDraftPolicy(null)).toEqual(documentDraftPolicy)
    expect(documentDraftPolicy.resume.maxWords).toBe(750)
    expect(documentDraftPolicy.resume.maxBullets).toBe(30)
    expect(documentDraftPolicy.resume.summaryMaxWords).toBe(90)
  })

  test('stored rules override only the budgets they set and never the cover letter', () => {
    const policy = effectiveDocumentDraftPolicy({
      maxWords: 600,
      sectionWordBudgets: { skills: 120 },
    })
    expect(policy.resume.maxWords).toBe(600)
    expect(policy.resume.maxBullets).toBe(documentDraftPolicy.resume.maxBullets)
    expect(policy.resume.sectionWordBudgets).toEqual({ skills: 120 })
    expect(policy.coverLetter).toEqual(documentDraftPolicy.coverLetter)
  })

  test('the direction form seeds the current word/bullet budgets', () => {
    const values = directionFormValues(null)
    expect(values.maxWords).toBe('750')
    expect(values.maxBullets).toBe('30')
    expect(values.summaryMaxWords).toBe('90')

    // Submitting the seeded controls stores explicit rules equal to the default.
    const seeded = directionFormSchema.parse({
      label: 'Platform Engineer',
      targetTitles: 'Platform Engineer',
      maxWords: values.maxWords,
      maxBullets: values.maxBullets,
      summaryMaxWords: values.summaryMaxWords,
      expectedRevision: '0',
    })
    expect(directionRulesFromForm(seeded)).toEqual({
      maxWords: documentDraftPolicy.resume.maxWords,
      maxBullets: documentDraftPolicy.resume.maxBullets,
      summaryMaxWords: documentDraftPolicy.resume.summaryMaxWords,
    })

    const parsed = directionFormSchema.parse({
      label: 'Platform Engineer',
      targetTitles: 'Platform Engineer',
      maxWords: '600',
      maxBullets: '24',
      summaryMaxWords: '70',
      expectedRevision: '0',
    })
    expect(directionRulesFromForm(parsed)).toEqual({
      maxWords: 600,
      maxBullets: 24,
      summaryMaxWords: 70,
    })
  })

  test('stored rules reach the prompt, the snapshot and deterministic validation', () => {
    createCareerDirection(executor(), {
      key: 'career-step10-rules',
      label: ' rules',
      targetTitles: ['Staff Engineer'],
      rules: {
        maxWords: 600,
        maxBullets: 24,
        summaryMaxWords: 70,
        sectionWordBudgets: { skills: 120 },
      },
    })
    const policy = directionDocumentPolicy('career-step10-rules', executor())
    expect(policy.resume.maxWords).toBe(600)
    expect(policy.resume.sectionWordBudgets).toEqual({ skills: 120 })

    const prompt = resumeDraftSystemPromptFor(policy)
    expect(prompt).toContain('within 600 words')
    expect(prompt).toContain('within 70 words')
    expect(prompt).toContain('24 bullets')

    const draft = createBaseResumeDraft(executor(), {
      directionKey: 'career-step10-rules',
      version: 'v1',
      markdown: baseResumeMarkdown,
    })
    approveBaseResumeVersion(executor(), draft.id)
    const snapshot = buildDocumentDraftSnapshot(applicationSource, executor())
    expect(snapshot.documentPolicy.resume.maxWords).toBe(600)
    expect(snapshot.documentPolicy.resume.sectionWordBudgets).toEqual({ skills: 120 })
    expect(snapshot.baseResume?.sha256).toBe(baseResumeTextHash(baseResumeMarkdown))
  })

  test('permissive budgets cannot bypass factual constraints', () => {
    const policy = effectiveDocumentDraftPolicy({
      maxWords: 5000,
      maxBullets: 500,
      summaryMaxWords: 1000,
    })
    const draft: DocumentDraft = {
      kind: 'resume',
      sections: [
        {
          id: 'summary',
          heading: 'Summary',
          blocks: [{ kind: 'paragraph', text: 'Supported 500 users with Kafka.' }],
        },
      ],
    }
    const warnings = validateDocumentDraft(draft, {
      maxWords: policy.resume.maxWords,
      maxBullets: policy.resume.maxBullets,
      sectionWordBudgets: { summary: policy.resume.summaryMaxWords },
      supportedMetrics: [],
      excludedSkills: ['Kafka'],
    })
    const codes = warnings.map((warning) => warning.code)
    expect(codes).toContain('unsupported-metric')
    expect(codes).toContain('excluded-skill-mentioned')
    expect(codes).not.toContain('over-word-budget')
  })
})

describe('base resume version lifecycle', () => {
  test('a draft is immutable, approval selects it and supersedes the previous approval', () => {
    const key = 'career-step10-lifecycle'
    createCareerDirection(executor(), { key, label: 'Lifecycle', targetTitles: ['Engineer'] })

    const first = createBaseResumeDraft(executor(), {
      directionKey: key,
      version: 'v1',
      markdown: baseResumeMarkdown,
    })
    expect(first.status).toBe('draft')
    expect(first.contentHash).toBe(baseResumeTextHash(baseResumeMarkdown))
    expect(selectedApprovedBaseResume(executor(), key)).toBeNull()

    approveBaseResumeVersion(executor(), first.id, { approvedAt: '2026-10-01' })
    expect(selectedApprovedBaseResume(executor(), key)?.id).toBe(first.id)

    const second = createBaseResumeDraft(executor(), {
      directionKey: key,
      version: 'v2',
      markdown: `${baseResumeMarkdown}\nEdited line.\n`,
    })
    // The previous approval stays selected until an explicit replacement.
    expect(selectedApprovedBaseResume(executor(), key)?.id).toBe(first.id)

    approveBaseResumeVersion(executor(), second.id, { approvedAt: '2026-10-14' })
    expect(selectedApprovedBaseResume(executor(), key)?.id).toBe(second.id)

    const versions = listBaseResumeVersions(executor(), key)
    const previous = versions.find((version) => version.id === first.id)
    expect(previous?.status).toBe('superseded')
    expect(previous?.markdown).toBe(baseResumeMarkdown)
    expect(previous?.contentHash).toBe(baseResumeTextHash(baseResumeMarkdown))
  })

  test('an empty or unapproved draft cannot generate', () => {
    const key = 'career-step10-unapproved'
    createCareerDirection(executor(), { key, label: 'Unapproved', targetTitles: ['Engineer'] })
    expect(() =>
      createBaseResumeDraft(executor(), { directionKey: key, version: 'empty', markdown: '  ' }),
    ).toThrow(/empty/i)

    const draft = createBaseResumeDraft(executor(), {
      directionKey: key,
      version: 'v1',
      markdown: baseResumeMarkdown,
    })
    expect(baseResumeSourceFor(key, executor())).toBeNull()
    expect(() =>
      buildDocumentDraftSnapshot(
        { ...applicationSource, application: { ...applicationSource.application, direction: key } },
        executor(),
      ),
    ).toThrow('No approved Base Resume')

    approveBaseResumeVersion(executor(), draft.id)
    expect(baseResumeSourceFor(key, executor())?.version).toBe('v1')
  })

  test('approval changes the freshness identity that document staleness keys on', () => {
    const key = 'career-step10-freshness'
    createCareerDirection(executor(), { key, label: 'Freshness', targetTitles: ['Engineer'] })
    const before = baseResumeIdentity(key, executor())
    expect(before).toEqual({ baseResumeHash: null, baseResumeVersion: null })

    const draft = createBaseResumeDraft(executor(), {
      directionKey: key,
      version: 'v1',
      markdown: baseResumeMarkdown,
    })
    approveBaseResumeVersion(executor(), draft.id)
    const after = baseResumeIdentity(key, executor())
    expect(after.baseResumeHash).toBe(baseResumeTextHash(baseResumeMarkdown))
    expect(after.baseResumeVersion).toBe('v1')
    expect(
      generationStalenessReasons(
        { ...before, directionPolicyHash: 'same' },
        { ...after, directionPolicyHash: 'same' },
      ),
    ).toContain('base-resume-changed')
  })

  test('editing a direction rule changes the document freshness identity', () => {
    const key = 'career-step10-rule-freshness'
    createCareerDirection(executor(), {
      key,
      label: 'Rule freshness',
      targetTitles: ['Engineer'],
      rules: { maxWords: 700 },
    })
    const record = readCareerDirection(executor(), key)
    if (!record) throw new Error('Direction fixture was not created.')
    const before = canonicalHash(directionDocumentPolicy(key, executor()))

    updateCareerDirection(
      executor(),
      key,
      { rules: { maxWords: 500 } },
      {
        expectedRevision: record.revision,
      },
    )
    const after = canonicalHash(directionDocumentPolicy(key, executor()))
    expect(after).not.toBe(before)
    expect(
      generationStalenessReasons({ directionPolicyHash: before }, { directionPolicyHash: after }),
    ).toContain('direction-rules-changed')
  })
})
