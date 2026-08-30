import { Database, type SQLQueryBindings } from 'bun:sqlite'

/**
 * Populated pre-cleanup fixture for the destructive contract migration. The
 * fixture seeds a database migrated through the full current chain (through
 * `0019_generation_input_identity`) with:
 *
 * - core resources the migration must preserve (companies, contacts,
 *   applications, application-contact links, follow-ups, interviews, Job Post
 *   raw text/hash, canonical skills/categories/aliases, and an encrypted Google
 *   Drive connection), and
 * - disposable derived AI history the migration is authorized to reset (Job
 *   Analysis runs/requirements/mappings, application-skill rows, Candidate runs
 *   and decisions, generation/document-review history, and baseline history).
 *
 * All values are synthetic; no private names, credentials, or user row contents
 * are used. The encrypted Drive token is an obvious placeholder, never a real
 * secret.
 */

export interface PreservedApplication {
  id: number
  companyId: number
  jobTitle: string
  url: string | null
  postedDate: string
  appliedDate: string | null
  priority: string
  status: string
  salary: string | null
}

export interface PreservedJobPosting {
  id: number
  applicationId: number
  rawText: string
  contentHash: string
}

export interface PreservedContact {
  id: number
  companyId: number
  name: string
  email: string | null
}

export interface PreCleanupFixture {
  companyIds: number[]
  contactIds: number[]
  applicationIds: number[]
  applicationContactLinks: Array<[number, number]>
  followUpIds: number[]
  interviewIds: number[]
  skillIds: number[]
  categoryKeys: string[]
  aliasIds: number[]
  preservedApplications: PreservedApplication[]
  preservedJobPostings: PreservedJobPosting[]
  preservedContacts: PreservedContact[]
  disposable: {
    jobPostingAnalysisIds: number[]
    jobRequirementIds: number[]
    requirementSkillLinks: Array<[number, number]>
    jobApplicationSkillLinks: Array<[number, number]>
    applicationAnalysisRunIds: number[]
    analysisRunDecisionIds: number[]
    generationRunIds: number[]
    generatedArtifactIds: number[]
    generationEvidenceSnapshotIds: number[]
    generationRunResultIds: number[]
    documentReviewIds: number[]
    baselineGenerationRunIds: number[]
    baselineGeneratedArtifactIds: number[]
    baselineEvidenceSnapshotIds: number[]
  }
}

function insertId(sqlite: Database, sql: string, ...params: SQLQueryBindings[]): number {
  const row = sqlite.query(sql).get(...params) as { id: number }
  return row.id
}

interface ApplicationSeed {
  companyId: number
  jobTitle: string
  direction: string
  location: string | null
  url: string | null
  postedDate: string
  priority: string
  appliedDate: string | null
  resumeVersion: string | null
  matchLevel: string | null
  applicationSource: string | null
  salary: string | null
  notes: string | null
  status: string
}

const applicationSeeds: ApplicationSeed[] = [
  {
    companyId: 0, // resolved below to companyIds[0]
    jobTitle: 'Frontend Developer',
    direction: 'fullstack',
    location: 'Remote (Canada)',
    url: 'https://example.com/careers/frontend-123',
    postedDate: '2026-01-05',
    priority: 'A',
    appliedDate: '2026-01-12',
    resumeVersion: 'frontend-v2',
    matchLevel: 'B',
    applicationSource: 'LinkedIn',
    salary: 'CA$120k - CA$140k',
    notes: 'Strong team and modern stack.',
    status: 'Interviewing',
  },
  {
    companyId: 1,
    jobTitle: 'Backend Engineer',
    direction: 'fullstack',
    location: null,
    url: 'https://second.example/jobs/backend-456',
    postedDate: '2026-02-01',
    priority: 'B',
    appliedDate: null,
    resumeVersion: null,
    matchLevel: null,
    applicationSource: 'Company site',
    salary: null,
    notes: null,
    status: 'Saved',
  },
]

interface ContactSeed {
  companyId: number
  name: string
  email: string | null
  linkedinUrl: string | null
}

const contactSeeds: ContactSeed[] = [
  {
    companyId: 0,
    name: 'Alice Recruiter',
    email: 'alice@example.com',
    linkedinUrl: 'https://linkedin.invalid/alice',
  },
  { companyId: 0, name: 'Bob Manager', email: 'bob@example.com', linkedinUrl: null },
  { companyId: 1, name: 'Carol HR', email: 'carol@second.example', linkedinUrl: null },
]

/**
 * Seeds the pre-cleanup fixture into a database already migrated through the
 * full current chain and returns every ID plus the exact raw text/URLs/core IDs
 * that later migration tests must prove are preserved.
 */
export function seedPreCleanupFixture(sqlite: Database): PreCleanupFixture {
  const companyIds = [
    insertId(
      sqlite,
      'INSERT INTO companies (name, website, created_at) VALUES (?, ?, ?) RETURNING id',
      'Example Corporation',
      'https://example.com',
      '2026-01-10T00:00:00.000Z',
    ),
    insertId(
      sqlite,
      'INSERT INTO companies (name, website, created_at) VALUES (?, ?, ?) RETURNING id',
      'Second Company',
      'https://second.example',
      '2026-02-01T00:00:00.000Z',
    ),
  ]

  const contactIds = contactSeeds.map((contact) =>
    insertId(
      sqlite,
      `INSERT INTO contacts (company_id, name, email, linkedin_url) VALUES (?, ?, ?, ?) RETURNING id`,
      companyIds[contact.companyId],
      contact.name,
      contact.email,
      contact.linkedinUrl,
    ),
  )

  const applicationIds = applicationSeeds.map((application) =>
    insertId(
      sqlite,
      `INSERT INTO job_applications (
        company_id, job_title, direction, location, url, posted_date, priority, applied_date,
        resume_version, match_level, application_source, salary, notes, status,
        status_before_archive, apply_today_target_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?) RETURNING id`,
      companyIds[application.companyId],
      application.jobTitle,
      application.direction,
      application.location,
      application.url,
      application.postedDate,
      application.priority,
      application.appliedDate,
      application.resumeVersion,
      application.matchLevel,
      application.applicationSource,
      application.salary,
      application.notes,
      application.status,
      '2026-01-06T00:00:00.000Z',
      '2026-01-18T00:00:00.000Z',
    ),
  )

  const applicationContactLinks: Array<[number, number]> = [
    [applicationIds[0], contactIds[0]],
    [applicationIds[0], contactIds[1]],
    [applicationIds[1], contactIds[2]],
  ]
  for (const [applicationId, contactId] of applicationContactLinks) {
    sqlite
      .query(
        'INSERT INTO job_applications_to_contacts (job_application_id, contact_id) VALUES (?, ?)',
      )
      .run(applicationId, contactId)
  }

  const followUpIds = [
    insertId(
      sqlite,
      `INSERT INTO follow_ups (job_application_id, action_date, notes) VALUES (?, ?, ?) RETURNING id`,
      applicationIds[0],
      '2026-01-15',
      'Emailed recruiter about next steps.',
    ),
    insertId(
      sqlite,
      `INSERT INTO follow_ups (job_application_id, action_date, notes) VALUES (?, ?, ?) RETURNING id`,
      applicationIds[1],
      '2026-02-10',
      'Follow up next week.',
    ),
  ]

  const interviewIds = [
    insertId(
      sqlite,
      `INSERT INTO interviews (job_application_id, interview_date, round_name, notes) VALUES (?, ?, ?, ?) RETURNING id`,
      applicationIds[0],
      '2026-01-22',
      'Technical screen',
      'Met the team.',
    ),
  ]

  const categoryKeys = ['languages-web', 'frontend', 'backend-apis', 'databases-caching']
  const categoryRows = [
    ['languages-web', 'Languages & Web Fundamentals', 10],
    ['frontend', 'Frontend', 20],
    ['backend-apis', 'Backend & APIs', 30],
    ['databases-caching', 'Databases & Caching', 40],
  ] as const
  for (const [key, label, sortOrder] of categoryRows) {
    // Migration 0012 already seeds the canonical taxonomy, so this insert is
    // intentionally idempotent: the fixture never duplicates a category key.
    sqlite
      .query(
        `INSERT OR IGNORE INTO skill_categories (key, label, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(key, label, sortOrder, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  }

  const skillRows = [
    ['typescript', 'TypeScript', 'languages-web', 'approved', 'career-data', 'career-typescript'],
    ['react', 'React', 'frontend', 'approved', 'career-data', 'career-react'],
    [
      'postgresql',
      'PostgreSQL',
      'databases-caching',
      'approved',
      'career-data',
      'career-postgresql',
    ],
    ['kafka', 'Kafka', 'backend-apis', 'pending', 'job-parser', null],
  ] as const
  const skillIds: number[] = []
  for (const [key, name, category, reviewStatus, origin, careerSkillId] of skillRows) {
    skillIds.push(
      insertId(
        sqlite,
        `INSERT INTO skills (
          key, name, category, review_status, origin, career_skill_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        key,
        name,
        category,
        reviewStatus,
        origin,
        careerSkillId,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ),
    )
  }

  const aliasRows = [
    [skillIds[0], 'TS', 'ts'],
    [skillIds[1], 'React.js', 'react.js'],
    [skillIds[2], 'Postgres', 'postgres'],
  ] as const
  const aliasIds: number[] = []
  for (const [skillId, alias, normalizedAlias] of aliasRows) {
    aliasIds.push(
      insertId(
        sqlite,
        `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
         VALUES (?, ?, ?, 'manual', ?) RETURNING id`,
        skillId,
        alias,
        normalizedAlias,
        '2026-01-01T00:00:00.000Z',
      ),
    )
  }

  // Encrypted Drive connection: a singleton with a clearly fake token. The
  // destructive migration must preserve it without ever exporting the token.
  sqlite
    .query(
      `INSERT INTO google_drive_connections (id, refresh_token_encrypted, folder_id, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?)`,
    )
    .run(
      'encrypted:fixture-token-not-a-real-secret',
      'drive-folder-fixture',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    )

  const preservedJobPostings: PreservedJobPosting[] = []
  const jobPostingIds: number[] = []
  const jobPostingRows = [
    {
      applicationId: applicationIds[0],
      rawText:
        'We are hiring a Frontend Developer experienced with TypeScript and React.\nBuild accessible, performant interfaces with a small product team.',
      contentHash: 'fixture-hash-frontend',
      capturedAt: '2026-01-05T00:00:00.000Z',
      parsedAt: '2026-01-05T00:05:00.000Z',
      parserModel: 'gpt-4o',
      parserPromptVersion: '1.0.0',
    },
    {
      applicationId: applicationIds[1],
      rawText:
        'Backend Engineer opening. We run PostgreSQL and Kafka at scale and value reliability.',
      contentHash: 'fixture-hash-backend',
      capturedAt: '2026-02-01T00:00:00.000Z',
      parsedAt: null,
      parserModel: null,
      parserPromptVersion: null,
    },
  ] as const
  for (const posting of jobPostingRows) {
    const postingId = insertId(
      sqlite,
      `INSERT INTO job_postings (
        job_application_id, raw_text, captured_at, content_hash, parsed_at, parser_model, parser_prompt_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      posting.applicationId,
      posting.rawText,
      posting.capturedAt,
      posting.contentHash,
      posting.parsedAt,
      posting.parserModel,
      posting.parserPromptVersion,
    )
    jobPostingIds.push(postingId)
    preservedJobPostings.push({
      id: postingId,
      applicationId: posting.applicationId,
      rawText: posting.rawText,
      contentHash: posting.contentHash,
    })
  }

  const jobPostingAnalysisIds: number[] = []
  const jobRequirementIds: number[] = []
  const requirementSkillLinks: Array<[number, number]> = []

  const analysisSeed = [
    {
      postingId: jobPostingIds[0],
      summary: 'Frontend role focused on TypeScript and React.',
      requirements: 'TypeScript\nReact',
      model: 'gpt-4o',
      promptVersion: '2.1.0',
      schemaVersion: '3.0.0',
      generatedAt: '2026-01-06T00:00:00.000Z',
      requirementsOf: [
        ['skill', 'required', 'explicit', 'Proficiency in TypeScript', 'TypeScript', skillIds[0]],
        ['skill', 'preferred', 'explicit', 'Experience with React', 'React', skillIds[1]],
      ],
    },
    {
      postingId: jobPostingIds[1],
      summary: 'Backend role focused on PostgreSQL and Kafka.',
      requirements: 'PostgreSQL\nKafka',
      model: 'gpt-4o',
      promptVersion: '2.1.0',
      schemaVersion: '3.0.0',
      generatedAt: '2026-02-02T00:00:00.000Z',
      requirementsOf: [
        ['skill', 'required', 'explicit', 'Proficiency in PostgreSQL', 'PostgreSQL', skillIds[2]],
        ['skill', 'mentioned', 'explicit', 'Experience with Kafka', 'Kafka', skillIds[3]],
      ],
    },
  ] as const

  for (const seed of analysisSeed) {
    const analysisId = insertId(
      sqlite,
      `INSERT INTO job_posting_analyses (
        job_posting_id, status, queue_job_id, attempts, input_hash, requirements, generated_at,
        model, prompt_version, summary, schema_version, created_at, updated_at, started_at, completed_at
      ) VALUES (?, 'Completed', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      seed.postingId,
      `queue-job-analysis-${seed.postingId}`,
      `hash-analysis-${seed.postingId}`,
      seed.requirements,
      seed.generatedAt,
      seed.model,
      seed.promptVersion,
      seed.summary,
      seed.schemaVersion,
      seed.generatedAt,
      seed.generatedAt,
      seed.generatedAt,
      seed.generatedAt,
    )
    jobPostingAnalysisIds.push(analysisId)

    let sequence = 0
    for (const [type, importance, basis, statement, sourceText, skillId] of seed.requirementsOf) {
      sequence += 1
      const requirementId = insertId(
        sqlite,
        `INSERT INTO job_requirements (
          job_posting_analysis_id, sequence, requirement_type, importance, basis, statement,
          source_text, inference_rationale, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?) RETURNING id`,
        analysisId,
        sequence,
        type,
        importance,
        basis,
        statement,
        sourceText,
        seed.generatedAt,
        seed.generatedAt,
      )
      jobRequirementIds.push(requirementId)
      sqlite
        .query(
          'INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id) VALUES (?, ?)',
        )
        .run(requirementId, skillId)
      requirementSkillLinks.push([requirementId, skillId])
    }
  }

  const jobApplicationSkillLinks: Array<[number, number]> = [
    [applicationIds[0], skillIds[0]],
    [applicationIds[0], skillIds[1]],
    [applicationIds[1], skillIds[2]],
    [applicationIds[1], skillIds[3]],
  ]
  const applicationSkillRows = [
    [
      applicationIds[0],
      skillIds[0],
      'TypeScript',
      'required',
      'proven-match',
      'include',
      'Core skill.',
    ],
    [applicationIds[0], skillIds[1], 'React', 'preferred', 'not-in-career-data', 'pending', null],
    [
      applicationIds[1],
      skillIds[2],
      'PostgreSQL',
      'required',
      'proven-match',
      'include',
      'Core skill.',
    ],
    [applicationIds[1], skillIds[3], 'Kafka', 'mentioned', 'not-in-career-data', 'skip', null],
  ] as const
  for (const [
    applicationId,
    skillId,
    rawLabel,
    importance,
    result,
    decision,
    reason,
  ] of applicationSkillRows) {
    sqlite
      .query(
        `INSERT INTO job_applications_to_skills (
          job_application_id, skill_id, raw_label, source_text, importance, parser_confidence,
          analysis_result, user_decision, decision_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0.9, ?, ?, ?, ?, ?)`,
      )
      .run(
        applicationId,
        skillId,
        rawLabel,
        rawLabel,
        importance,
        result,
        decision,
        reason,
        '2026-01-06T00:00:00.000Z',
        '2026-01-06T00:00:00.000Z',
      )
  }

  const applicationAnalysisRunIds: number[] = []
  const analysisRunDecisionIds: number[] = []
  const candidateSeed = [
    {
      applicationId: applicationIds[0],
      queueJobId: 'queue-candidate-1',
      inputHash: 'hash-candidate-1',
      resultJson: '{"fitRecommendation":"strong"}',
      model: 'gpt-4o',
      promptVersion: '2.0.0',
      schemaVersion: '2.0.0',
      decisions: [
        [skillIds[0], 'include', 'Required skill.'],
        [skillIds[1], 'skip', null],
      ],
    },
  ] as const
  for (const seed of candidateSeed) {
    const runId = insertId(
      sqlite,
      `INSERT INTO application_analysis_runs (
        job_application_id, status, queue_job_id, attempts, input_hash, input_snapshot_json,
        result_json, model, prompt_version, schema_version, recommended_profile_id,
        confirmed_profile_id, profile_confirmed_at, created_at, updated_at, started_at, completed_at
      ) VALUES (?, 'Completed', ?, 1, ?, '{}', ?, ?, ?, ?, 'fullstack', 'fullstack', ?, ?, ?, ?, ?) RETURNING id`,
      seed.applicationId,
      seed.queueJobId,
      seed.inputHash,
      seed.resultJson,
      seed.model,
      seed.promptVersion,
      seed.schemaVersion,
      '2026-01-18T00:00:00.000Z',
      '2026-01-18T00:00:00.000Z',
      '2026-01-18T00:00:00.000Z',
      '2026-01-18T00:00:00.000Z',
      '2026-01-18T00:00:00.000Z',
    )
    applicationAnalysisRunIds.push(runId)
    for (const [skillId, decision, reason] of seed.decisions) {
      analysisRunDecisionIds.push(
        insertId(
          sqlite,
          `INSERT INTO analysis_run_decisions (
            application_analysis_run_id, skill_id, decision, reason, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
          runId,
          skillId,
          decision,
          reason,
          '2026-01-18T00:00:00.000Z',
          '2026-01-18T00:00:00.000Z',
        ),
      )
    }
  }

  const generationRunIds: number[] = []
  const generatedArtifactIds: number[] = []
  const generationEvidenceSnapshotIds: number[] = []
  const generationRunResultIds: number[] = []
  const documentReviewIds: number[] = []

  const generationSeed = [
    {
      applicationId: applicationIds[0],
      queueJobId: 'queue-generation-1',
      inputHash: 'hash-generation-1',
    },
  ] as const
  for (const seed of generationSeed) {
    const runId = insertId(
      sqlite,
      `INSERT INTO generation_runs (
        job_application_id, status, queue_job_id, attempts, input_hash, frozen_input_json,
        resume_model, cover_letter_model, prompt_version, schema_version, created_at, updated_at,
        started_at, completed_at
      ) VALUES (?, 'Completed', ?, 1, ?, '{}', 'gpt-4o', 'gpt-4o', '1.0.0', '1.0.0', ?, ?, ?, ?) RETURNING id`,
      seed.applicationId,
      seed.queueJobId,
      seed.inputHash,
      '2026-01-19T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
    )
    generationRunIds.push(runId)

    generatedArtifactIds.push(
      insertId(
        sqlite,
        `INSERT INTO generated_artifacts (
          generation_run_id, type, file_name, file_path, mime_type, created_at
        ) VALUES (?, 'resume', ?, ?, ?, ?) RETURNING id`,
        runId,
        'resume-fixture.docx',
        'artifacts/resume-fixture.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '2026-01-19T00:00:00.000Z',
      ),
    )

    generationEvidenceSnapshotIds.push(
      insertId(
        sqlite,
        `INSERT INTO generation_evidence_snapshots (
          generation_run_id, snapshot_json, file_path, created_at
        ) VALUES (?, '{}', ?, ?) RETURNING id`,
        runId,
        'artifacts/snapshot-fixture.json',
        '2026-01-19T00:00:00.000Z',
      ),
    )

    generationRunResultIds.push(
      insertId(
        sqlite,
        `INSERT INTO generation_run_results (
          generation_run_id, resume_json, cover_letter_json, ats_audit_json, created_at, updated_at
        ) VALUES (?, '{}', NULL, '{}', ?, ?) RETURNING id`,
        runId,
        '2026-01-19T00:00:00.000Z',
        '2026-01-19T00:00:00.000Z',
      ),
    )

    documentReviewIds.push(
      insertId(
        sqlite,
        `INSERT INTO document_reviews (
          generation_run_id, status, queue_job_id, attempts, input_hash, result_json, model,
          prompt_version, schema_version, created_at, updated_at, started_at, completed_at
        ) VALUES (?, 'Completed', 'queue-review-1', 1, 'hash-review-1', '{}', 'gpt-4o', '1.0.0', '1.0.0', ?, ?, ?, ?) RETURNING id`,
        runId,
        '2026-01-19T00:00:00.000Z',
        '2026-01-19T00:00:00.000Z',
        '2026-01-19T00:00:00.000Z',
        '2026-01-19T00:00:00.000Z',
      ),
    )
  }

  const baselineGenerationRunIds: number[] = []
  const baselineGeneratedArtifactIds: number[] = []
  const baselineEvidenceSnapshotIds: number[] = []

  const baselineRunId = insertId(
    sqlite,
    `INSERT INTO baseline_generation_runs (
      direction, target_title, target_keywords, status, queue_job_id, attempts, created_at,
      updated_at, started_at, completed_at
    ) VALUES ('fullstack', 'Frontend Developer', '["react","typescript"]', 'Completed', 'queue-baseline-1', 1, ?, ?, ?, ?) RETURNING id`,
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
  )
  baselineGenerationRunIds.push(baselineRunId)

  baselineGeneratedArtifactIds.push(
    insertId(
      sqlite,
      `INSERT INTO baseline_generated_artifacts (
        baseline_generation_run_id, type, file_name, file_path, mime_type, created_at
      ) VALUES (?, 'resume', ?, ?, ?, ?) RETURNING id`,
      baselineRunId,
      'baseline-resume-fixture.docx',
      'artifacts/baseline-resume-fixture.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '2026-01-01T00:00:00.000Z',
    ),
  )

  baselineEvidenceSnapshotIds.push(
    insertId(
      sqlite,
      `INSERT INTO baseline_generation_evidence_snapshots (
        baseline_generation_run_id, snapshot_json, file_path, created_at
      ) VALUES (?, '{}', ?, ?) RETURNING id`,
      baselineRunId,
      'artifacts/baseline-snapshot-fixture.json',
      '2026-01-01T00:00:00.000Z',
    ),
  )

  return {
    companyIds,
    contactIds,
    applicationIds,
    applicationContactLinks,
    followUpIds,
    interviewIds,
    skillIds,
    categoryKeys,
    aliasIds,
    preservedApplications: applicationIds.map((id, index) => ({
      id,
      companyId: companyIds[applicationSeeds[index].companyId],
      jobTitle: applicationSeeds[index].jobTitle,
      url: applicationSeeds[index].url,
      postedDate: applicationSeeds[index].postedDate,
      appliedDate: applicationSeeds[index].appliedDate,
      priority: applicationSeeds[index].priority,
      status: applicationSeeds[index].status,
      salary: applicationSeeds[index].salary,
    })),
    preservedJobPostings,
    preservedContacts: contactIds.map((id, index) => ({
      id,
      companyId: companyIds[contactSeeds[index].companyId],
      name: contactSeeds[index].name,
      email: contactSeeds[index].email,
    })),
    disposable: {
      jobPostingAnalysisIds,
      jobRequirementIds,
      requirementSkillLinks,
      jobApplicationSkillLinks,
      applicationAnalysisRunIds,
      analysisRunDecisionIds,
      generationRunIds,
      generatedArtifactIds,
      generationEvidenceSnapshotIds,
      generationRunResultIds,
      documentReviewIds,
      baselineGenerationRunIds,
      baselineGeneratedArtifactIds,
      baselineEvidenceSnapshotIds,
    },
  }
}
