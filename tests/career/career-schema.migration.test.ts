import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedDatabase, migrationFolderUpTo, removeTempDir } from '../db/support/migrations'
import { seedPopulatedLegacyCatalog } from './fixtures'

/**
 * Step 2 migration contracts. Migration 0026 is additive: it must install the
 * relational career tables on a fresh database, and migrate a populated
 * database up from 0025 without losing analyses, artifacts, OAuth metadata or
 * the historical requirement/skill mappings, which are backfilled as
 * requirement-owned mentions.
 */

const careerTables = [
  'career_profile',
  'career_state',
  'career_directions',
  'career_education',
  'career_experiences',
  'career_achievements',
  'career_projects',
  'career_stories',
  'career_publications',
  'career_skills',
  'career_base_resumes',
  'career_achievement_skills',
  'career_project_skills',
  'career_publication_projects',
  'career_achievement_publications',
  'career_record_directions',
  'job_requirement_skill_mentions',
] as const

function tableNames(sqlite: ReturnType<typeof migratedDatabase>) {
  return sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String((row as { name: string }).name))
}

/**
 * Applies only the additive 0026 career-facts migration on top of a database
 * already at 0025, so these contracts stay scoped to 0026; the destructive 0027
 * simplification has its own migration suite.
 */
function applyCareerFactsMigration(sqlite: ReturnType<typeof migratedDatabase>) {
  const folder = migrationFolderUpTo(26)
  try {
    migrate(drizzle({ client: sqlite }), { migrationsFolder: folder })
  } finally {
    removeTempDir(folder)
  }
}

describe('career schema migration on a fresh database', () => {
  test('creates every career table with clean integrity checks', () => {
    const sqlite = migratedDatabase()
    try {
      const tables = tableNames(sqlite)
      expect(careerTables.filter((table) => !tables.includes(table))).toEqual([])
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })

  test('creates only the career state bookkeeping row, never a fabricated candidate', () => {
    const sqlite = migratedDatabase()
    try {
      const states = sqlite.query('SELECT id, revision, content_hash FROM career_state').all()
      expect(states).toEqual([{ id: 1, revision: 0, content_hash: '' }])
      expect(sqlite.query('SELECT count(*) AS count FROM career_profile').get()).toEqual({
        count: 0,
      })
    } finally {
      sqlite.close()
    }
  })
})

describe('career schema migration over a populated database', () => {
  test('preserves analyses, artifacts, OAuth metadata and the legacy skill mappings', () => {
    const folder = migrationFolderUpTo(25)
    const sqlite = migratedDatabase(folder)
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)
      sqlite
        .query(
          `INSERT INTO generation_runs (application_analysis_run_id, status, queue_job_id, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          seeded.applicationAnalysisRunId,
          'Completed',
          'legacy-generation-job',
          '2026-08-01T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z',
        )
      sqlite
        .query(
          `INSERT INTO generated_artifacts (generation_run_id, type, file_name, file_path, mime_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          1,
          'resume',
          'legacy-resume.docx',
          '/tmp/legacy-resume.docx',
          'application/msword',
          '2026-08-01T00:00:00.000Z',
        )
      sqlite
        .query(
          `INSERT INTO google_drive_connections (id, refresh_token_encrypted, folder_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          1,
          'legacy-encrypted-token',
          'legacy-folder-id',
          '2026-08-01T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z',
        )

      applyCareerFactsMigration(sqlite)

      expect(
        sqlite.query('SELECT count(*) AS count FROM job_requirements_to_skills').get(),
      ).toEqual({
        count: 1,
      })
      expect(sqlite.query('SELECT count(*) AS count FROM job_requirements').get()).toEqual({
        count: 1,
      })
      expect(sqlite.query('SELECT count(*) AS count FROM generated_artifacts').get()).toEqual({
        count: 1,
      })
      expect(
        sqlite
          .query('SELECT refresh_token_encrypted, folder_id FROM google_drive_connections')
          .all(),
      ).toEqual([
        { refresh_token_encrypted: 'legacy-encrypted-token', folder_id: 'legacy-folder-id' },
      ])
      expect(sqlite.query('SELECT count(*) AS count FROM skills').get()).toEqual({ count: 3 })
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })

  test('backfills one mapped mention per legacy mapping and labels unknown provenance', () => {
    const folder = migrationFolderUpTo(25)
    const sqlite = migratedDatabase(folder)
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)
      applyCareerFactsMigration(sqlite)

      const mentions = sqlite
        .query(
          `SELECT job_requirement_id, raw_term, normalized_term, mapping_state, resolved_skill_id, occurrences_json
           FROM job_requirement_skill_mentions`,
        )
        .all() as Array<{
        job_requirement_id: number
        raw_term: string
        normalized_term: string
        mapping_state: string
        resolved_skill_id: number | null
        occurrences_json: string
      }>
      expect(mentions).toHaveLength(1)
      expect(mentions[0]).toMatchObject({
        job_requirement_id: seeded.requirementId,
        raw_term: 'TypeScript',
        normalized_term: 'typescript',
        mapping_state: 'mapped',
        resolved_skill_id: seeded.typescriptSkillId,
      })
      expect(JSON.parse(mentions[0].occurrences_json)).toMatchObject({
        source: 'legacy-junction',
        provenance: 'legacy-unknown',
      })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })

  test('turns an ambiguous legacy mapping into one pending mention instead of picking a winner', () => {
    const folder = migrationFolderUpTo(25)
    const sqlite = migratedDatabase(folder)
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)
      sqlite
        .query(
          `INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id, raw_label, confidence)
           VALUES (?, ?, ?, ?)`,
        )
        .run(seeded.requirementId, seeded.mergedSkillId, 'TypeScript', 0.4)

      applyCareerFactsMigration(sqlite)

      const mentions = sqlite
        .query(
          `SELECT mapping_state, resolved_skill_id, occurrences_json
           FROM job_requirement_skill_mentions`,
        )
        .all() as Array<{
        mapping_state: string
        resolved_skill_id: number | null
        occurrences_json: string
      }>
      expect(mentions).toHaveLength(1)
      expect(mentions[0].mapping_state).toBe('pending')
      expect(mentions[0].resolved_skill_id).toBeNull()
      expect(JSON.parse(mentions[0].occurrences_json).conflict).toHaveLength(2)
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})

describe('career schema constraints', () => {
  test('reject duplicate stable keys and duplicate base resume versions', () => {
    const sqlite = migratedDatabase()
    try {
      sqlite
        .query(
          `INSERT INTO career_directions (key, label, target_titles_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('fullstack', 'Full-Stack Developer', '["Full-Stack Developer"]', 'T', 'T')
      const insertEducation = sqlite.query(
        `INSERT INTO career_education (stable_key, degree, school, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      insertEducation.run('edu-one', 'BSc', 'Example School', 'T', 'T')
      expect(() => insertEducation.run('edu-one', 'MSc', 'Example School', 'T', 'T')).toThrow()

      const insertResume = sqlite.query(
        `INSERT INTO career_base_resumes (direction_key, version, status, markdown, content_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      insertResume.run('fullstack', 'v1', 'draft', '# Draft', 'hash-1', 'T', 'T')
      expect(() =>
        insertResume.run('fullstack', 'v1', 'draft', '# Draft again', 'hash-2', 'T', 'T'),
      ).toThrow()
    } finally {
      sqlite.close()
    }
  })

  test('allow at most one approved base resume per direction', () => {
    const sqlite = migratedDatabase()
    try {
      sqlite
        .query(
          `INSERT INTO career_directions (key, label, target_titles_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('fullstack', 'Full-Stack Developer', '[]', 'T', 'T')
      const insertResume = sqlite.query(
        `INSERT INTO career_base_resumes (direction_key, version, status, markdown, content_hash, approved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      insertResume.run(
        'fullstack',
        'v1',
        'approved',
        '# Approved',
        'hash-1',
        '2026-10-01',
        'T',
        'T',
      )
      expect(() =>
        insertResume.run(
          'fullstack',
          'v2',
          'approved',
          '# Other',
          'hash-2',
          '2026-10-14',
          'T',
          'T',
        ),
      ).toThrow()
      // A later draft is always allowed and does not displace the approval.
      insertResume.run('fullstack', 'v2', 'draft', '# Draft', 'hash-2', null, 'T', 'T')
      expect(
        sqlite.query("SELECT version FROM career_base_resumes WHERE status = 'approved'").all(),
      ).toEqual([{ version: 'v1' }])
    } finally {
      sqlite.close()
    }
  })

  test('reject an approved base resume without an approval date and an empty body', () => {
    const sqlite = migratedDatabase()
    try {
      sqlite
        .query(
          `INSERT INTO career_directions (key, label, target_titles_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('fullstack', 'Full-Stack Developer', '[]', 'T', 'T')
      const insertResume = sqlite.query(
        `INSERT INTO career_base_resumes (direction_key, version, status, markdown, content_hash, approved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      expect(() =>
        insertResume.run('fullstack', 'v1', 'approved', '# Approved', 'h', null, 'T', 'T'),
      ).toThrow()
      expect(() =>
        insertResume.run('fullstack', 'v2', 'draft', '   ', 'h', null, 'T', 'T'),
      ).toThrow()
    } finally {
      sqlite.close()
    }
  })

  test('require a mapped mention to resolve and keep other mentions unresolved', () => {
    const folder = migrationFolderUpTo(25)
    const sqlite = migratedDatabase(folder)
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)
      applyCareerFactsMigration(sqlite)
      const insertMention = sqlite.query(
        `INSERT INTO job_requirement_skill_mentions (job_requirement_id, raw_term, normalized_term, mapping_state, resolved_skill_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      expect(() =>
        insertMention.run(seeded.requirementId, 'OAuth', 'oauth', 'mapped', null, 'T', 'T'),
      ).toThrow()
      expect(() =>
        insertMention.run(
          seeded.requirementId,
          'OAuth',
          'oauth',
          'pending',
          seeded.typescriptSkillId,
          'T',
          'T',
        ),
      ).toThrow()
      insertMention.run(seeded.requirementId, 'OAuth', 'oauth', 'pending', null, 'T', 'T')
      // The same normalized term cannot be mentioned twice for one requirement.
      expect(() =>
        insertMention.run(seeded.requirementId, 'OAuth 2.0', 'oauth', 'skipped', null, 'T', 'T'),
      ).toThrow()
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })

  test('enforce evidence, eligibility and date constraints', () => {
    const sqlite = migratedDatabase()
    try {
      const insertAchievement = sqlite.query(
        `INSERT INTO career_achievements (stable_key, claim, safe_to_use, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      expect(() => insertAchievement.run('a1', 'Claim', 2, 'T', 'T')).toThrow()

      const insertProject = sqlite.query(
        `INSERT INTO career_projects (stable_key, name, eligibility, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      expect(() => insertProject.run('p1', 'Project', 'maybe', 'T', 'T')).toThrow()

      const insertEducation = sqlite.query(
        `INSERT INTO career_education (stable_key, degree, school, date_precision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      expect(() => insertEducation.run('e1', 'BSc', 'School', 'quarter', 'T', 'T')).toThrow()
      expect(() =>
        sqlite
          .query(
            `INSERT INTO career_education (stable_key, degree, school, year, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('e2', 'BSc', 'School', 1800, 'T', 'T'),
      ).toThrow()
    } finally {
      sqlite.close()
    }
  })

  test('require a positive revision counter', () => {
    const sqlite = migratedDatabase()
    try {
      expect(() =>
        sqlite
          .query(
            `INSERT INTO career_experiences (stable_key, company, role, revision, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('x', 'Company', 'Role', 0, 'T', 'T'),
      ).toThrow()
    } finally {
      sqlite.close()
    }
  })
})
