import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { baseResumeTextHash } from '../../src/lib/base-resumes'

/**
 * Synthetic career fixtures for the database-owned career and curated skill
 * catalog plan (`career-database-v1`).
 *
 * Everything here is invented ("Jordan Rivera", "Northwind Analytics"). It is
 * never derived from, or a sample of, the owner's private career-data.
 *
 * Fixtures are expressed as the checked-in JSON documents the production loader
 * already understands, so `loadCareerData` and `validateCareerData` remain the
 * single source of truth for their shape. Later steps reuse the same documents
 * as import sources for the relational career tables.
 */

function document(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export const syntheticTaxonomy = {
  schemaVersion: 1,
  categories: [
    { key: 'languages-web', label: 'Languages & Web Fundamentals', sortOrder: 10 },
    { key: 'frontend', label: 'Frontend', sortOrder: 20 },
    { key: 'backend-apis', label: 'Backend & APIs', sortOrder: 30 },
    { key: 'databases-caching', label: 'Databases & Caching', sortOrder: 40 },
    { key: 'cloud-devops', label: 'Cloud & DevOps', sortOrder: 60 },
    { key: 'testing-quality', label: 'Testing & Quality', sortOrder: 70 },
    { key: 'domain-platforms', label: 'Domain & Platforms', sortOrder: 110 },
  ],
} as const

const candidateDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  identity: {
    fullName: 'Jordan Rivera',
    email: 'jordan.rivera@example.test',
    phone: '+1-555-0100',
    location: 'Edmonton, AB, Canada',
    website: 'https://example.test/jordan-rivera',
    linkedinUrl: 'https://example.test/in/jordan-rivera',
    githubUrl: 'https://example.test/jordan-rivera',
  },
  authorization: {
    workAuthorization: 'Synthetic citizen of Exampleland',
    requiresSponsorship: false,
    notes: 'Synthetic authorization fixture.',
  },
  careerBreak: {
    hasBreak: true,
    startDate: '2024-02',
    endDate: '2024-06',
    datePrecision: 'month',
    reason: 'Synthetic caregiving break used to exercise date-precision editing.',
  },
  truthfulnessRules: {
    neverClaimUnexperiencedSkill: true,
    requireAccurateDates: true,
    notes: 'A claim is only usable when a validated source supports it.',
  },
  education: [
    {
      id: 'edu-example-degree',
      degree: 'BSc Computer Science',
      school: 'Example Institute of Technology',
      startDate: '2016-09',
      endDate: '2020-04',
      datePrecision: 'month',
      displayDates: '2016 - 2020',
      sortOrder: 1,
      coursework: ['Distributed Systems', 'Database Systems'],
      additionalDetails: 'Synthetic coursework fixture.',
    },
    {
      id: 'edu-example-certificate',
      degree: 'Cloud Practitioner Certificate',
      school: 'Example Training Group',
      year: 2023,
      datePrecision: 'year',
      displayDates: '2023',
      sortOrder: 2,
      coursework: [],
      additionalDetails: '',
    },
  ],
}

const experiencesDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  experiences: [
    {
      id: 'northwind-analytics',
      company: 'Northwind Analytics',
      role: 'Senior Software Developer',
      employmentNature: 'full-time',
      startDate: '2021-03',
      endDate: null,
      datePrecision: 'month',
      displayDates: 'Mar 2021 - Present',
      sortOrder: 1,
      context: 'Synthetic product team building reporting tooling.',
      responsibilities: [
        'Owned the reporting API used by synthetic internal teams.',
        'Reviewed changes across the synthetic web client.',
      ],
      extensionMetadata: { syntheticImportSource: 'fixture' },
    },
    {
      id: 'contoso-health',
      company: 'Contoso Health',
      role: 'Software Developer',
      employmentNature: 'contract',
      startDate: '2020-05',
      endDate: '2021-02',
      datePrecision: 'month',
      displayDates: 'May 2020 - Feb 2021',
      sortOrder: 2,
      context: 'Synthetic interoperability integration work.',
      responsibilities: ['Integrated a synthetic FHIR interface.'],
      extensionMetadata: {},
    },
  ],
}

// Achievements and projects below deliberately mix authored extension fields with
// the editorial columns the relational model must preserve.
const achievementsDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  achievements: [
    {
      id: 'reporting-api-delivery',
      experienceId: 'northwind-analytics',
      claim: 'Delivered a synthetic reporting API that replaced a manual export.',
      skills: ['typescript', 'rest-api'],
      directions: ['fullstack', 'frontend'],
      publicationIds: ['synthetic-preprint'],
      safeToUse: true,
      evidence: ['Synthetic review notes: reporting-api-delivery'],
      evidenceNarratives: ['Synthetic narrative describing the delivery.'],
      limitations: ['Covers only the synthetic reporting scope.'],
    },
    {
      id: 'unverified-claim',
      experienceId: null,
      claim: 'Unsafe synthetic claim that must never reach a generated document.',
      skills: ['react'],
      directions: ['frontend'],
      publicationIds: [],
      safeToUse: false,
      evidence: [],
      evidenceNarratives: [],
      limitations: ['Marked unsafe on purpose for contract tests.'],
    },
  ],
}

const projectsDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  projects: [
    {
      id: 'synthetic-tracker',
      name: 'Synthetic Tracker',
      experienceId: 'northwind-analytics',
      skills: ['typescript', 'sqlite'],
      directions: ['fullstack'],
      ownership: 'personal',
      eligibility: 'resume-eligible',
      completion: 'completed',
      urls: ['https://example.test/synthetic-tracker'],
      safeWording: 'Built a synthetic tracker for contract tests.',
      limitations: ['Synthetic only; no production users.'],
    },
  ],
}

const skillsDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  skills: [
    {
      id: 'typescript',
      label: 'TypeScript',
      category: 'languages-web',
      aliases: ['TS'],
      directions: ['fullstack', 'frontend'],
      level: 'advanced',
      resumeEligible: true,
      personalExplanation: 'Used daily across synthetic reporting work.',
      notes: '',
      evidence: ['reporting-api-delivery'],
    },
    {
      id: 'javascript',
      label: 'JavaScript',
      category: 'languages-web',
      aliases: ['JS', 'ECMAScript', 'ES6'],
      directions: ['fullstack', 'frontend'],
      level: 'advanced',
      resumeEligible: true,
      personalExplanation: 'Synthetic runtime work.',
      notes: '',
      evidence: ['reporting-api-delivery'],
    },
    {
      id: 'react',
      label: 'React',
      category: 'frontend',
      aliases: ['React.js'],
      directions: ['frontend'],
      level: 'intermediate',
      resumeEligible: true,
      personalExplanation: 'Synthetic client work.',
      notes: 'Excluded while its only source is unsafe.',
      evidence: [],
    },
    {
      id: 'rest-api',
      label: 'REST APIs',
      category: 'backend-apis',
      aliases: ['REST'],
      directions: ['fullstack'],
      level: 'advanced',
      resumeEligible: true,
      personalExplanation: 'Synthetic integration work.',
      notes: '',
      evidence: ['reporting-api-delivery'],
    },
    {
      id: 'sqlite',
      label: 'SQLite',
      category: 'databases-caching',
      aliases: ['SQLite3'],
      directions: ['fullstack'],
      level: 'intermediate',
      resumeEligible: true,
      personalExplanation: 'Synthetic local persistence.',
      notes: '',
      evidence: ['synthetic-tracker'],
    },
  ],
}

const storiesDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  stories: [
    {
      id: 'reporting-migration-story',
      experienceId: 'northwind-analytics',
      title: 'Synthetic reporting migration',
      directions: ['fullstack'],
      context: 'A synthetic reporting pipeline was replaced.',
      situation: 'Synthetic situation text.',
      task: 'Synthetic task text.',
      action: 'Synthetic action text.',
      result: 'Synthetic result text.',
      narrative: 'Synthetic STAR narrative used by contract tests.',
    },
  ],
}

const publicationsDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  publications: [
    {
      id: 'synthetic-preprint',
      title: 'A Synthetic Preprint About Reporting',
      citation: 'Rivera, J. (2025). A Synthetic Preprint About Reporting. Example Journal.',
      year: 2025,
      publicationType: 'preprint',
      status: 'preprint',
      authors: [
        { name: 'Jordan Rivera', isCandidate: true },
        { name: 'Alex Example', isCandidate: false },
      ],
      authorListIsTruncated: false,
      experienceId: 'northwind-analytics',
      projectIds: ['synthetic-tracker'],
      directions: ['fullstack'],
      contributions: ['Synthetic data analysis and write-up.'],
      sourceUrls: ['https://example.test/preprints/synthetic'],
      safeToUse: true,
    },
  ],
}

const preferencesDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  directionDefinitions: {
    fullstack: {
      label: 'Full-Stack Developer',
      targetTitles: ['Full-Stack Developer', 'Senior Software Developer'],
    },
    frontend: { label: 'Frontend Developer', targetTitles: ['Frontend Developer'] },
    fhir: { label: 'FHIR Developer', targetTitles: ['FHIR Developer'] },
  },
  careerPreferences: {
    locations: ['Edmonton, AB', 'Remote (Canada)'],
    workModes: ['remote', 'hybrid'],
    availability: 'Two weeks notice',
    compensation: { currency: 'CAD', minimum: 120000, notes: 'Synthetic range.' },
    notes: 'Synthetic preference fixture.',
  },
}

/**
 * The removed portfolio-topic feature no longer has a structured reader, but the
 * raw document is still part of the legacy directory so the directory-import
 * round-trip keeps proving the file is accepted and only its unmodelled roots
 * (`schemaVersion`, `lastUpdated`) are carried into
 * `career_profile.documents_json`. It holds no topics.
 */
const portfolioDocument = {
  schemaVersion: 1,
  lastUpdated: '2026-10-14',
  topics: [],
}

/** The nine checked-in legacy documents, keyed by their file name. */
export const syntheticCareerDocuments: Record<string, unknown> = {
  'candidate.json': candidateDocument,
  'experiences.json': experiencesDocument,
  'achievements.json': achievementsDocument,
  'publications.json': publicationsDocument,
  'projects.json': projectsDocument,
  'skills.json': skillsDocument,
  'stories.json': storiesDocument,
  'preferences.json': preferencesDocument,
  'portfolio-content.json': portfolioDocument,
}

/**
 * Approved catalog entries the candidate does NOT possess. Mapping a job term to
 * one of these must never claim personal skill possession.
 */
export const catalogOnlySkills = [
  { key: 'kubernetes', name: 'Kubernetes', category: 'cloud-devops' },
  { key: 'playwright', name: 'Playwright', category: 'testing-quality' },
] as const

/**
 * Job terms that exercise catalog resolution. `expectation` is consumed by the
 * resolver contract; only proves every case is represented and that
 * both acceptance orderings exist.
 */
export const syntheticRequirementTerms = [
  {
    statement: 'JavaScript and TypeScript proficiency',
    sourceText: 'Strong JavaScript and TypeScript required.',
    requirementType: 'skill',
    importance: 'required',
    term: 'JavaScript and TypeScript',
    expectation: 'composite-split',
  },
  {
    statement: 'TypeScript and JavaScript proficiency',
    sourceText: 'TypeScript and JavaScript are both required.',
    requirementType: 'skill',
    importance: 'preferred',
    term: 'TypeScript and JavaScript',
    expectation: 'composite-split',
  },
  {
    statement: 'Modern ES6 JavaScript experience',
    sourceText: 'Modern ES6 experience preferred.',
    requirementType: 'skill',
    importance: 'preferred',
    term: 'ES6',
    expectation: 'curated-alias',
  },
  {
    statement: 'API integration experience',
    sourceText: 'Experience with API Integration.',
    requirementType: 'skill',
    importance: 'required',
    term: 'API Integration',
    expectation: 'ambiguous-pending',
  },
  {
    statement: 'OAuth 2.0 authentication experience',
    sourceText: 'Familiarity with OAuth 2.0.',
    requirementType: 'skill',
    importance: 'preferred',
    term: 'OAuth',
    expectation: 'unknown-pending',
  },
  {
    statement: 'Code review participation',
    sourceText: 'Participate in code review.',
    requirementType: 'skill',
    importance: 'mentioned',
    term: 'Code Review',
    expectation: 'duplicate-occurrence',
  },
  {
    statement: 'Frontend Development ownership',
    sourceText: 'Own Frontend Development outcomes.',
    requirementType: 'skill',
    importance: 'mentioned',
    term: 'Frontend Development',
    expectation: 'broad-concept',
  },
  {
    statement: 'OpenAPI specification authoring',
    sourceText: 'Author OpenAPI specifications.',
    requirementType: 'skill',
    importance: 'preferred',
    term: 'OpenAPI',
    expectation: 'catalog-category',
  },
] as const

/**
 * `loadCareerData` caches by source-file mtime signature only, so two different
 * directories written in the same millisecond would collide in that cache. The
 * stamp is derived from the directory path, which is unique per temporary
 * directory and stable across repeated writes.
 */
function fixtureStamp(directory: string): number {
  const seed = Number.parseInt(createHash('sha256').update(directory).digest('hex').slice(0, 8), 16)
  return 1_600_000_000 + (seed % 300_000_000) / 1000
}

/**
 * Writes a career document set plus the synthetic taxonomy into `directory` and
 * returns it. Use this to materialize modified document sets (for example the
 * ambiguous-alias fixture) with a cache-safe mtime signature.
 */
export function writeCareerDocuments(
  directory: string,
  documents: Record<string, unknown>,
): string {
  mkdirSync(directory, { recursive: true })
  const stamp = fixtureStamp(directory)
  const files = [['skill-taxonomy.json', syntheticTaxonomy], ...Object.entries(documents)] as const
  for (const [fileName, document_] of files) {
    const path = resolve(directory, fileName)
    writeFileSync(path, document(document_))
    utimesSync(path, stamp, stamp)
  }
  return directory
}

/**
 * Writes the synthetic documents plus taxonomy into `directory` and returns it.
 */
export function writeSyntheticCareerData(directory: string): string {
  return writeCareerDocuments(directory, syntheticCareerDocuments)
}

/**
 * Returns a deep copy of the synthetic documents with an alias that collides with
 * another catalog entry's display name. Deterministic aliases must produce an
 * actionable conflict, never an arbitrary winner.
 */
export function documentsWithAmbiguousAlias(): Record<string, unknown> {
  const documents = structuredClone(syntheticCareerDocuments)
  const skills = documents['skills.json'] as { skills: Array<Record<string, unknown>> }
  skills.skills.push({
    id: 'graphql-api',
    label: 'GraphQL API',
    category: 'backend-apis',
    aliases: ['REST APIs'],
    directions: ['fullstack'],
    level: 'intermediate',
    resumeEligible: true,
    evidence: [],
  })
  return documents
}

/** Same-day editorial revisions: identical date, different content and hash. */
export const sameDayRevisions = {
  updatedAt: '2026-10-14',
  before: {
    id: 'reporting-api-delivery',
    claim: 'Delivered a synthetic reporting API that replaced a manual export.',
  },
  after: {
    id: 'reporting-api-delivery',
    claim: 'Delivered a synthetic reporting API and a synthetic metric store.',
  },
} as const

export const approvedBaseResumeMarkdown = `# Jordan Rivera

## Summary
Synthetic approved Base Resume for the full-stack direction.

## Experience
- Northwind Analytics — Senior Software Developer
`

export const draftBaseResumeMarkdown = `# Jordan Rivera

## Summary
Synthetic draft Base Resume awaiting explicit approval.

## Experience
- Northwind Analytics — Senior Software Developer
- Contoso Health — Software Developer
`

/**
 * Manifest matching {@link approvedBaseResumeMarkdown}. The digest is computed
 * with the production hashing function so the fixture cannot drift from it.
 */
export function approvedBaseResumeManifest(approvedAt = '2026-10-01') {
  return {
    schemaVersion: 1 as const,
    lastUpdated: approvedAt,
    resumes: [
      {
        direction: 'fullstack',
        fileName: 'fullstack.md',
        version: 'v1',
        approvedAt,
        sha256: baseResumeTextHash(approvedBaseResumeMarkdown),
      },
    ],
  }
}

const legacyTimestamp = '2026-08-01T00:00:00.000Z'

/**
 * Seeds a populated catalog and analysis history into a migrated database: an
 * approved imported skill with an alias, a legacy pending parser skill, a merged
 * skill with a redirect, and a job requirement mapped to the approved skill.
 *
 * must preserve every one of these rows and their provenance.
 */
export function seedPopulatedLegacyCatalog(sqlite: Database) {
  // `skill_categories` is already seeded by migration 0012/0021; the seeder only
  // adds the catalog entries that reference it.
  const insertSkill = sqlite.query(
    `INSERT INTO skills (key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
  const typescript = insertSkill.get(
    'typescript',
    'TypeScript',
    'backend-apis',
    'approved',
    'career-data',
    null,
    legacyTimestamp,
    legacyTimestamp,
  ) as { id: number }
  const pending = insertSkill.get(
    'legacy-parser-skill',
    'Legacy Parser Skill',
    null,
    'pending',
    'job-parser',
    null,
    legacyTimestamp,
    legacyTimestamp,
  ) as { id: number }
  const merged = insertSkill.get(
    'legacy-merged-skill',
    'Legacy Merged Skill',
    null,
    'merged',
    'job-parser',
    typescript.id,
    legacyTimestamp,
    legacyTimestamp,
  ) as { id: number }

  sqlite
    .query(
      `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
    VALUES (?, ?, ?, ?, ?)`,
    )
    .run(typescript.id, 'TS', 'ts', 'career-data', legacyTimestamp)

  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Legacy Company', legacyTimestamp, legacyTimestamp) as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (company_id, job_title, direction, posted_date, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      company.id,
      'Legacy Role',
      'fullstack',
      '2026-08-01',
      'B',
      'Saved',
      legacyTimestamp,
      legacyTimestamp,
    ) as {
    id: number
  }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, version, raw_text, captured_at, content_hash)
    VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(application.id, 1, 'Legacy synthetic posting text.', legacyTimestamp, 'legacy-hash') as {
    id: number
  }
  const postingAnalysis = sqlite
    .query(
      `INSERT INTO job_posting_analyses (job_posting_id, status, created_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(posting.id, 'Completed', legacyTimestamp, legacyTimestamp, legacyTimestamp) as {
    id: number
  }
  const requirement = sqlite
    .query(
      `INSERT INTO job_requirements (
    job_posting_analysis_id, sequence, requirement_type, importance, basis, statement,
    source_text, created_at, updated_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      postingAnalysis.id,
      1,
      'skill',
      'required',
      'explicit',
      'TypeScript experience required.',
      'Legacy synthetic source text.',
      legacyTimestamp,
      legacyTimestamp,
    ) as { id: number }

  const run = sqlite
    .query(
      `INSERT INTO application_analysis_runs (job_posting_analysis_id, status, queue_job_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(postingAnalysis.id, 'Completed', 'legacy-queue-job', legacyTimestamp, legacyTimestamp) as {
    id: number
  }

  // From migration 0026 the mapping is owned by the mention row and
  // `job_requirements_to_skills` is a derived read-only view (0027). Before
  // 0026 the junction itself is still the storage.
  const mentionsTable = sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'job_requirement_skill_mentions'",
    )
    .get()
  if (mentionsTable) {
    sqlite
      .query(
        `INSERT INTO job_requirement_skill_mentions (
     job_requirement_id, raw_term, normalized_term, mapping_state, resolved_skill_id,
     occurrences_json, created_at, updated_at
    ) VALUES (?, ?, 'typescript', 'mapped', ?, ?, ?, ?)`,
      )
      .run(
        requirement.id,
        'TypeScript',
        typescript.id,
        '[{"source":"jd","provenance":"jd-text","confidence":1}]',
        legacyTimestamp,
        legacyTimestamp,
      )
  } else {
    sqlite
      .query(
        `INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id, raw_label, confidence)
     VALUES (?, ?, ?, ?)`,
      )
      .run(requirement.id, typescript.id, 'TypeScript', 1)
  }

  return {
    typescriptSkillId: typescript.id,
    pendingSkillId: pending.id,
    mergedSkillId: merged.id,
    requirementId: requirement.id,
    applicationAnalysisRunId: run.id,
  }
}
