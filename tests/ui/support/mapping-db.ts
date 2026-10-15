import { Database } from 'bun:sqlite'

/**
 * Seeds a real requirement-term mapping scenario into the suite's isolated
 * database (`DB_FILE_NAME`, created outside the repository by the test preload)
 * so the mapping route can be exercised end to end:
 *
 *  route -> skill-mapping service -> mention repository -> SQLite
 *
 * Rows are addressed by explicit high ids and a sentinel company name, and
 * {@link removeMappingFixture} deletes them after each test. Nothing here ever
 * opens the developer's `jobs.db`.
 */

/** Explicit, high application id so the fixture cannot collide with other suites. */
export const mappingFixtureApplicationId = 9907
/** A second application that owns the same term, used for ownership checks. */
export const mappingFixtureOtherApplicationId = 9908

const companyName = '__skill-mapping-fixture__'
const otherCompanyName = '__skill-mapping-fixture-other__'
const categoryKey = '__mapping-fixture-category__'

export type MappingFixture = {
  applicationId: number
  otherApplicationId: number
  otherMentionId: number
  postingId: number
  otherPostingId: number
  analysisId: number
  otherAnalysisId: number
  requirementId: number
  /** The pending mention of the fixture application. */
  mentionId: number
  /** Approved catalog entries usable as mapping targets. */
  kubernetesId: number
  playwrightId: number
  categoryKey: string
}

function openDatabase(): Database {
  const file = process.env.DB_FILE_NAME
  if (!file)
    throw new Error(
      'DB_FILE_NAME must point at a temporary database outside the repository before running mapping UI tests.',
    )
  return new Database(file, { create: true })
}

function insertApplication(sqlite: Database, id: number, company: string, title: string) {
  sqlite
    .query(
      'INSERT OR REPLACE INTO companies (name, website, created_at, updated_at) VALUES (?, NULL, ?, ?)',
    )
    .run(company, '2026-10-14', '2026-10-14')
  const companyId = (
    sqlite.query('SELECT id FROM companies WHERE name = ?').get(company) as { id: number }
  ).id
  sqlite
    .query(
      `INSERT OR REPLACE INTO job_applications (
    id, company_id, job_title, direction, location, url, posted_date, priority,
    application_source, status, created_at, updated_at
   ) VALUES (?, ?, ?, 'fullstack', NULL, NULL, '2026-10-14', 'B', 'Fixture', 'Saved', '2026-10-14', '2026-10-14')`,
    )
    .run(id, companyId, title)
}

function insertPosting(sqlite: Database, applicationId: number, rawText: string): number {
  return (
    sqlite
      .query(
        `INSERT INTO job_postings (job_application_id, version, raw_text, captured_at, content_hash)
     VALUES (?, 1, ?, '2026-10-14', ?) RETURNING id`,
      )
      .get(applicationId, rawText, `mapping-fixture-hash-${applicationId}`) as { id: number }
  ).id
}

function insertCompletedAnalysis(sqlite: Database, postingId: number): number {
  return (
    sqlite
      .query(
        `INSERT INTO job_posting_analyses (
     job_posting_id, status, attempts, created_at, updated_at, completed_at
    ) VALUES (?, 'Completed', 1, '2026-10-14', '2026-10-14', '2026-10-14') RETURNING id`,
      )
      .get(postingId) as { id: number }
  ).id
}

function insertRequirement(sqlite: Database, analysisId: number, statement: string): number {
  return (
    sqlite
      .query(
        `INSERT INTO job_requirements (
     job_posting_analysis_id, sequence, requirement_type, importance, basis,
     statement, source_text, inference_rationale, created_at, updated_at
    ) VALUES (?, 1, 'skill', 'required', 'explicit', ?, ?, NULL, '2026-10-14', '2026-10-14') RETURNING id`,
      )
      .get(analysisId, statement, statement) as { id: number }
  ).id
}

function insertMention(
  sqlite: Database,
  requirementId: number,
  rawTerm: string,
  state: 'pending' | 'skipped',
  resolvedSkillId: number | null,
): number {
  return (
    sqlite
      .query(
        `INSERT INTO job_requirement_skill_mentions (
     job_requirement_id, raw_term, normalized_term, mapping_state, resolved_skill_id,
     occurrences_json, revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, '2026-10-14', '2026-10-14') RETURNING id`,
      )
      .get(
        requirementId,
        rawTerm,
        rawTerm.trim().toLowerCase(),
        state,
        resolvedSkillId,
        JSON.stringify([
          {
            source: 'job-analysis',
            provenance: 'job-parser',
            context: 'Fixture context',
            confidence: null,
          },
        ]),
      ) as { id: number }
  ).id
}

function insertSkill(sqlite: Database, key: string, name: string, category: string | null): number {
  return (
    sqlite
      .query(
        `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
     VALUES (?, ?, ?, 'approved', 'manual', '2026-10-14', '2026-10-14') RETURNING id`,
      )
      .get(key, name, category) as { id: number }
  ).id
}

/**
 * Creates the fixture: two applications that both extracted the same term, an
 * approved catalog entry to map it to, a second entry for remapping, and a
 * category for the create form.
 */
export function seedMappingFixture(): MappingFixture {
  const sqlite = openDatabase()
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;')
    sqlite
      .query(
        `INSERT OR REPLACE INTO skill_categories (key, label, sort_order, created_at, updated_at)
     VALUES (?, 'Fixture Category', 900, '2026-10-14', '2026-10-14')`,
      )
      .run(categoryKey)

    insertApplication(sqlite, mappingFixtureApplicationId, companyName, 'Platform Engineer')
    insertApplication(
      sqlite,
      mappingFixtureOtherApplicationId,
      otherCompanyName,
      'Other Platform Engineer',
    )

    const postingId = insertPosting(sqlite, mappingFixtureApplicationId, 'We run Kubernetes.')
    const otherPostingId = insertPosting(
      sqlite,
      mappingFixtureOtherApplicationId,
      'We also run Kubernetes.',
    )
    const analysisId = insertCompletedAnalysis(sqlite, postingId)
    const otherAnalysisId = insertCompletedAnalysis(sqlite, otherPostingId)
    const requirementId = insertRequirement(
      sqlite,
      analysisId,
      'Operate Kubernetes clusters in production.',
    )
    const otherRequirementId = insertRequirement(
      sqlite,
      otherAnalysisId,
      'Operate Kubernetes clusters in staging.',
    )
    const kubernetesId = insertSkill(
      sqlite,
      'fixture-kubernetes',
      'Fixture Kubernetes',
      categoryKey,
    )
    const playwrightId = insertSkill(sqlite, 'fixture-playwright', 'Fixture Playwright', null)

    return {
      analysisId,
      applicationId: mappingFixtureApplicationId,
      categoryKey,
      kubernetesId,
      mentionId: insertMention(sqlite, requirementId, 'Kubernetes', 'pending', null),
      otherAnalysisId,
      otherApplicationId: mappingFixtureOtherApplicationId,
      otherMentionId: insertMention(sqlite, otherRequirementId, 'Kubernetes', 'pending', null),
      otherPostingId,
      playwrightId,
      postingId,
      requirementId,
    }
  } finally {
    sqlite.close()
  }
}

/**
 * Removes every row this fixture created. `job_requirements_to_skills` is a
 * read-only view over the mentions, so deleting the fixture applications
 * cascades postings, analyses, requirements and mentions; the alias rows hold
 * restricting foreign keys into `skills`, so they are cleared first.
 */
export function removeMappingFixture(fixture: MappingFixture) {
  const sqlite = openDatabase()
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;')
    sqlite
      .query('DELETE FROM job_applications WHERE id IN (?, ?)')
      .run(fixture.applicationId, fixture.otherApplicationId)
    sqlite.query('DELETE FROM companies WHERE name IN (?, ?)').run(companyName, otherCompanyName)
    sqlite
      .query(
        `DELETE FROM skill_aliases
     WHERE skill_id IN (SELECT id FROM skills WHERE key LIKE 'fixture-%')`,
      )
      .run()
    sqlite.query("DELETE FROM skills WHERE key LIKE 'fixture-%'").run()
    sqlite.query('DELETE FROM skill_categories WHERE key = ?').run(fixture.categoryKey)
  } finally {
    sqlite.close()
  }
}

/** One stored mention row as SQLite holds it after a mutation. */
export function storedMention(mentionId: number) {
  const sqlite = openDatabase()
  try {
    return sqlite
      .query(
        'SELECT mapping_state, resolved_skill_id, revision FROM job_requirement_skill_mentions WHERE id = ?',
      )
      .get(mentionId) as {
      mapping_state: string
      resolved_skill_id: number | null
      revision: number
    } | null
  } finally {
    sqlite.close()
  }
}

/** Junction rows written for one catalog skill. */
export function storedJunctions(skillId: number) {
  const sqlite = openDatabase()
  try {
    return sqlite
      .query('SELECT raw_label FROM job_requirements_to_skills WHERE skill_id = ?')
      .all(skillId) as Array<{ raw_label: string | null }>
  } finally {
    sqlite.close()
  }
}

/** Global aliases of one catalog skill. */
export function storedAliases(skillId: number) {
  const sqlite = openDatabase()
  try {
    return (
      sqlite
        .query('SELECT alias FROM skill_aliases WHERE skill_id = ? ORDER BY normalized_alias')
        .all(skillId) as Array<{ alias: string }>
    ).map((row) => row.alias)
  } finally {
    sqlite.close()
  }
}

/** Catalog entry lookup by key, used to assert explicit creation results. */
export function storedSkill(key: string) {
  const sqlite = openDatabase()
  try {
    return sqlite
      .query(
        'SELECT id, key, name, category, review_status, origin FROM skills WHERE key = ? LIMIT 1',
      )
      .get(key) as {
      id: number
      key: string
      name: string
      category: string | null
      review_status: string
      origin: string
    } | null
  } finally {
    sqlite.close()
  }
}

/** Personal `career_skills` rows for one catalog skill; mapping must add none. */
export function storedCareerSkills(skillId: number) {
  const sqlite = openDatabase()
  try {
    return (
      sqlite
        .query('SELECT count(*) AS count FROM career_skills WHERE skill_id = ?')
        .get(skillId) as { count: number }
    ).count
  } finally {
    sqlite.close()
  }
}
