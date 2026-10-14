import { describe, expect, test } from 'bun:test'
import { baseResumeTextHash } from '../../src/lib/base-resumes'
import { canonicalHash } from '../../src/lib/canonical-hash'
import { loadCareerDataFrom } from '../support/career-data'
import {
  approvedBaseResumeManifest,
  approvedBaseResumeMarkdown,
  catalogOnlySkills,
  documentsWithAmbiguousAlias,
  draftBaseResumeMarkdown,
  sameDayRevisions,
  syntheticCareerDocuments,
  syntheticRequirementTerms,
  writeCareerDocuments,
  writeSyntheticCareerData,
} from './fixtures'

/**
 * Step 1 fixture contracts. These prove the synthetic career data is realistic
 * enough to drive every later step: it loads through the production loader, it
 * carries an editable field for each fact the management UI must expose, and it
 * reproduces the catalog, mapping and freshness edge cases the plan names.
 */

const loadSynthetic = () => loadCareerDataFrom(writeSyntheticCareerData)

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

/**
 * Reads a collection directly from the fixture documents. The fixtures are the
 * import source for the relational career tables, so field coverage is asserted
 * against the authored documents rather than the file loader's parse result.
 */
function fixtureItem(file: string, key: string): Record<string, unknown> {
  const document = asRecord(syntheticCareerDocuments[file])
  const collection = document[key]
  if (!Array.isArray(collection) || collection.length === 0)
    throw new Error(`Fixture collection ${file}#${key} is missing.`)
  return collection[0] as Record<string, unknown>
}

describe('synthetic career fixtures', () => {
  test('load through the production loader as valid canonical career data', () => {
    const data = loadSynthetic()
    expect(data.skills.skills.map((skill) => skill.id).sort()).toEqual([
      'javascript',
      'react',
      'rest-api',
      'sqlite',
      'typescript',
    ])
    expect(data.experiences.experiences.map((item) => item.id)).toEqual([
      'northwind-analytics',
      'contoso-health',
    ])
    expect(Object.keys(data.preferences.directionDefinitions).sort()).toEqual([
      'fhir',
      'frontend',
      'fullstack',
    ])
  })

  test('carry an editable field for every fact the management UI must expose', () => {
    const candidate = asRecord(syntheticCareerDocuments['candidate.json'])
    expect(asRecord(candidate.identity).fullName).toBe('Jordan Rivera')
    expect(asRecord(candidate.authorization).requiresSponsorship).toBe(false)
    expect(asRecord(candidate.careerBreak).datePrecision).toBe('month')
    expect(asRecord(candidate.truthfulnessRules).requireAccurateDates).toBe(true)

    const education = asRecord((candidate.education as unknown[])[0])
    for (const field of [
      'datePrecision',
      'displayDates',
      'sortOrder',
      'coursework',
      'additionalDetails',
    ])
      expect(education).toHaveProperty(field)

    const experience = fixtureItem('experiences.json', 'experiences')
    for (const field of [
      'employmentNature',
      'startDate',
      'endDate',
      'datePrecision',
      'displayDates',
      'sortOrder',
      'context',
      'responsibilities',
      'extensionMetadata',
    ])
      expect(experience).toHaveProperty(field)

    const achievement = fixtureItem('achievements.json', 'achievements')
    for (const field of [
      'claim',
      'safeToUse',
      'evidence',
      'evidenceNarratives',
      'limitations',
      'skills',
      'directions',
      'publicationIds',
    ])
      expect(achievement).toHaveProperty(field)

    const project = fixtureItem('projects.json', 'projects')
    for (const field of [
      'ownership',
      'eligibility',
      'completion',
      'urls',
      'safeWording',
      'limitations',
    ])
      expect(project).toHaveProperty(field)

    const skill = fixtureItem('skills.json', 'skills')
    for (const field of [
      'level',
      'resumeEligible',
      'personalExplanation',
      'notes',
      'evidence',
      'aliases',
    ])
      expect(skill).toHaveProperty(field)

    const story = fixtureItem('stories.json', 'stories')
    for (const field of ['title', 'context', 'situation', 'task', 'action', 'result', 'narrative'])
      expect(story).toHaveProperty(field)

    const publication = fixtureItem('publications.json', 'publications')
    for (const field of [
      'authors',
      'contributions',
      'sourceUrls',
      'safeToUse',
      'experienceId',
      'projectIds',
      'directions',
      'status',
      'authorListIsTruncated',
    ])
      expect(publication).toHaveProperty(field)

    const preferences = asRecord(
      asRecord(syntheticCareerDocuments['preferences.json']).careerPreferences,
    )
    for (const field of ['locations', 'workModes', 'availability', 'compensation'])
      expect(preferences).toHaveProperty(field)

    const topic = fixtureItem('portfolio-content.json', 'topics')
    for (const field of [
      'title',
      'status',
      'sortOrder',
      'projects',
      'directions',
      'outline',
      'details',
    ])
      expect(topic).toHaveProperty(field)
  })

  test('keep approved catalog entries separate from personal skill possession', () => {
    const data = loadSynthetic()
    const personalSkillNames = new Set(
      data.skills.skills.map((skill) => skill.label.toLocaleLowerCase()),
    )
    expect(catalogOnlySkills.length).toBeGreaterThan(0)
    for (const catalogSkill of catalogOnlySkills) {
      expect(personalSkillNames.has(catalogSkill.name.toLocaleLowerCase())).toBe(false)
    }
  })

  test('reject an ambiguous catalog alias instead of silently picking a winner', () => {
    expect(() =>
      loadCareerDataFrom((directory) =>
        writeCareerDocuments(directory, documentsWithAmbiguousAlias()),
      ),
    ).toThrow(/label/i)
  })

  test('read extension fields without dropping the authored fields', () => {
    const data = loadSynthetic()
    expect(asRecord(fixtureItem('experiences.json', 'experiences').extensionMetadata)).toEqual({
      syntheticImportSource: 'fixture',
    })
    expect(data.skills.skills.length).toBe(5)
    expect(Object.keys(syntheticCareerDocuments)).toHaveLength(9)
  })
})

describe('same-day editorial changes', () => {
  test('are distinguishable by content hash even when the date is unchanged', () => {
    expect(sameDayRevisions.before.id).toBe(sameDayRevisions.after.id)
    expect(sameDayRevisions.updatedAt).toBe('2026-10-14')
    expect(canonicalHash(sameDayRevisions.before)).not.toBe(canonicalHash(sameDayRevisions.after))
  })

  test('hash identical content identically regardless of key order', () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }))
  })
})

describe('base resume fixtures', () => {
  test('record an approval digest that matches the approved Markdown', () => {
    const manifest = approvedBaseResumeManifest()
    expect(manifest.resumes[0].sha256).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
  })

  test('keep the draft visibly different from the approved version', () => {
    expect(draftBaseResumeMarkdown).not.toBe(approvedBaseResumeMarkdown)
    expect(baseResumeTextHash(draftBaseResumeMarkdown)).not.toBe(
      baseResumeTextHash(approvedBaseResumeMarkdown),
    )
    const manifest = approvedBaseResumeManifest()
    expect(manifest.resumes.map((entry) => entry.version)).toEqual(['v1'])
    expect(
      manifest.resumes.some(
        (entry) => entry.sha256 === baseResumeTextHash(draftBaseResumeMarkdown),
      ),
    ).toBe(false)
  })
})

describe('requirement term fixtures', () => {
  test('cover every catalog resolution outcome', () => {
    const expectations = new Set(syntheticRequirementTerms.map((term) => term.expectation))
    expect([...expectations].sort()).toEqual([
      'ambiguous-pending',
      'broad-concept',
      'catalog-category',
      'composite-split',
      'curated-alias',
      'duplicate-occurrence',
      'unknown-pending',
    ])
  })

  test('include both composite orderings so resolution cannot depend on order', () => {
    const composites = syntheticRequirementTerms.filter(
      (term) => term.expectation === 'composite-split',
    )
    expect(composites.map((term) => term.term).sort()).toEqual([
      'JavaScript and TypeScript',
      'TypeScript and JavaScript',
    ])
  })
})
