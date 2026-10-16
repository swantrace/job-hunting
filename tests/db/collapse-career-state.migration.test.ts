import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedDatabase, migrationFolderUpTo, removeTempDir } from './support/migrations'

/**
 * Migration 0029 contract: `career_state` is dissolved into the career tables.
 *
 * This suite builds a database at 0028, seeds career rows plus the `career_state`
 * archive (per-record extras, the candidate/preferences extras and the source
 * document roots — including nested objects), then applies `./drizzle` and
 * checks that:
 *
 * - the schema has 36 application tables and `career_state` is gone;
 * - every career row count and every direction link is unchanged;
 * - each per-record extras object landed on the row that owns it, keyed exactly
 *   as the archive stored it (`personalSkills` by catalog key, Base Resumes by
 *   `<directionKey>#<version>`);
 * - `career_profile.documents_json` carries the unmodelled document roots with
 *   nested objects still JSON objects, not strings;
 * - `integrity_check` and `foreign_key_check` are clean.
 */

const T = '2026-10-14T00:00:00.000Z'

const preservedTables = [
  'career_profile',
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
  'skills',
  'skill_categories',
  'skill_aliases',
] as const

function count(sqlite: Database, table: string): number {
  return (sqlite.query(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count
}

function tableNames(sqlite: Database): string[] {
  return sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all()
    .map((row) => String((row as { name: string }).name))
}

function jsonColumn(sqlite: Database, sql: string) {
  return sqlite.query(sql).get() as Record<string, unknown>
}

/**
 * Seeds a representative slice of the 0028 career schema plus the archive in
 * `career_state`: this is the data the frozen migration must move without loss.
 */
function seedCareerArchive(sqlite: Database): void {
  sqlite
    .query(
      'INSERT OR IGNORE INTO skill_categories (key, label, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run('languages-web', 'Languages & Web', 10, T, T)
  sqlite
    .query(
      `INSERT OR IGNORE INTO skills (key, name, category, review_status, origin, created_at, updated_at)
       VALUES ('typescript', 'TypeScript', 'languages-web', 'approved', 'career-data', ?, ?)`,
    )
    .run(T, T)
  const skill = sqlite.query("SELECT id FROM skills WHERE key = 'typescript'").get() as {
    id: number
  }
  sqlite
    .query(
      `INSERT INTO career_profile (id, full_name, email, revision, created_at, updated_at)
       VALUES (1, 'Migration Candidate', 'migration@example.test', 3, ?, ?)`,
    )
    .run(T, T)
  sqlite
    .query(
      `INSERT INTO career_directions (key, label, target_titles_json, sort_order, revision, created_at, updated_at)
       VALUES ('fullstack', 'Full-Stack Developer', '["Full-Stack Developer"]', 0, 1, ?, ?)`,
    )
    .run(T, T)
  sqlite
    .query(
      `INSERT INTO career_education (stable_key, degree, school, created_at, updated_at)
       VALUES ('edu-1', 'BSc', 'Example Institute', ?, ?)`,
    )
    .run(T, T)
  sqlite
    .query(
      `INSERT INTO career_experiences (stable_key, company, role, extension_json, created_at, updated_at)
       VALUES ('exp-1', 'Example Co', 'Engineer', '{"preExisting":true}', ?, ?)`,
    )
    .run(T, T)
  const achievement = sqlite
    .query(
      `INSERT INTO career_achievements (stable_key, claim, created_at, updated_at)
       VALUES ('ach-1', 'Shipped a thing', ?, ?) RETURNING id`,
    )
    .get(T, T) as { id: number }
  const project = sqlite
    .query(
      `INSERT INTO career_projects (stable_key, name, created_at, updated_at)
       VALUES ('prj-1', 'Synthetic tracker', ?, ?) RETURNING id`,
    )
    .get(T, T) as { id: number }
  const story = sqlite
    .query(
      `INSERT INTO career_stories (stable_key, title, created_at, updated_at)
       VALUES ('sto-1', 'A story', ?, ?) RETURNING id`,
    )
    .get(T, T) as { id: number }
  const publication = sqlite
    .query(
      `INSERT INTO career_publications (stable_key, title, citation, year, status, created_at, updated_at)
       VALUES ('pub-1', 'A paper', 'A. Author et al. 2024', 2024, 'published', ?, ?) RETURNING id`,
    )
    .get(T, T) as { id: number }
  sqlite
    .query(
      `INSERT INTO career_skills (skill_id, level, created_at, updated_at) VALUES (?, 'advanced', ?, ?)`,
    )
    .run(skill.id, T, T)
  sqlite
    .query(
      `INSERT INTO career_base_resumes (direction_key, version, status, markdown, content_hash, created_at, updated_at)
       VALUES ('fullstack', 'v1', 'draft', '# Draft', 'hash-1', ?, ?)`,
    )
    .run(T, T)
  sqlite
    .query(`INSERT INTO career_achievement_skills (achievement_id, skill_id) VALUES (?, ?)`)
    .run(achievement.id, skill.id)
  sqlite
    .query('INSERT INTO career_project_skills (project_id, skill_id) VALUES (?, ?)')
    .run(project.id, skill.id)
  sqlite
    .query('INSERT INTO career_publication_projects (publication_id, project_id) VALUES (?, ?)')
    .run(publication.id, project.id)
  sqlite
    .query(
      'INSERT INTO career_achievement_publications (achievement_id, publication_id) VALUES (?, ?)',
    )
    .run(achievement.id, publication.id)
  for (const [column, id] of [
    ['achievement_id', achievement.id],
    ['project_id', project.id],
    ['story_id', story.id],
    ['publication_id', publication.id],
  ] as const) {
    sqlite
      .query(
        `INSERT INTO career_record_directions (direction_key, ${column}) VALUES ('fullstack', ?)`,
      )
      .run(id)
  }

  sqlite
    .query(
      `UPDATE career_state
       SET revision = 7, content_hash = 'archive-hash', legacy_documents_json = ?, extension_json = ?, updated_at = ?
       WHERE id = 1`,
    )
    .run(
      JSON.stringify({
        'candidate.json': {
          schemaVersion: 1,
          lastUpdated: '2026-10-01',
          identity: { fullName: 'Migration Candidate' },
          education: [],
          authorization: { workAuthorization: 'citizen' },
        },
        'portfolio-content.json': {
          schemaVersion: 1,
          lastUpdated: '2026-10-02',
          jobSearch: { titles: ['a', 'b'], remote: true },
          levelDefinitions: { senior: { label: 'Senior' } },
        },
      }),
      JSON.stringify({
        records: {
          education: { 'edu-1': { datePrecisionNote: 'term', nested: { a: 1 } } },
          experiences: { 'exp-1': { imported: true } },
          achievements: { 'ach-1': { metric: 'p95' } },
          projects: { 'prj-1': { repoUrl: 'https://example.test/repo' } },
          stories: { 'sto-1': { theme: 'growth' } },
          publications: { 'pub-1': { publicationType: 'preprint' } },
          personalSkills: { typescript: { directions: ['fullstack'] } },
          baseResumes: { 'fullstack#v1': { reviewer: 'me' } },
          candidate: { $: { preferredName: 'M' } },
          preferences: { $: { visaNote: 'z' } },
        },
        extensions: { someDocument: { kept: true } },
      }),
      T,
    )
}

describe('career_state collapse migration (0029)', () => {
  test('moves every archived extension and document root without losing career rows', () => {
    const folder = migrationFolderUpTo(28)
    const sqlite = migratedDatabase(folder)
    try {
      seedCareerArchive(sqlite)
      const before = new Map(preservedTables.map((table) => [table, count(sqlite, table)]))
      const linksBefore = sqlite
        .query(
          'SELECT direction_key, achievement_id, project_id, story_id, publication_id, position FROM career_record_directions ORDER BY id',
        )
        .all()

      // Apply the frozen 0029 migration on top of the 0028 database.
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      // The current chain also includes extension intake and batch analysis.
      const tables = tableNames(sqlite)
      expect(tables).toHaveLength(38)
      expect(tables).not.toContain('career_state')

      // Every career row count and direction link survives.
      for (const table of preservedTables) {
        expect(count(sqlite, table)).toBe(before.get(table) ?? -1)
      }
      expect(
        sqlite
          .query(
            'SELECT direction_key, achievement_id, project_id, story_id, publication_id, position FROM career_record_directions ORDER BY id',
          )
          .all(),
      ).toEqual(linksBefore)

      // Per-record extras landed on the row that owns them.
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.datePrecisionNote') AS value FROM career_education WHERE stable_key = 'edu-1'",
        ).value,
      ).toBe('term')
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_type(extension_json, '$.nested') AS value FROM career_education WHERE stable_key = 'edu-1'",
        ).value,
      ).toBe('object')
      // The experience already owned an extension column; COALESCE keeps it.
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_type(extension_json, '$.preExisting') AS value FROM career_experiences WHERE stable_key = 'exp-1'",
        ).value,
      ).toBe('true')
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.metric') AS value FROM career_achievements WHERE stable_key = 'ach-1'",
        ).value,
      ).toBe('p95')
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.repoUrl') AS value FROM career_projects WHERE stable_key = 'prj-1'",
        ).value,
      ).toBe('https://example.test/repo')
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.theme') AS value FROM career_stories WHERE stable_key = 'sto-1'",
        ).value,
      ).toBe('growth')
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.publicationType') AS value FROM career_publications WHERE stable_key = 'pub-1'",
        ).value,
      ).toBe('preprint')
      // Personal skills are keyed by catalog key, Base Resumes by direction#version.
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(career_skills.extension_json, '$.directions[0]') AS value FROM career_skills JOIN skills ON skills.id = career_skills.skill_id WHERE skills.key = 'typescript'",
        ).value,
      ).toBe('fullstack')
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.reviewer') AS value FROM career_base_resumes WHERE direction_key = 'fullstack' AND version = 'v1'",
        ).value,
      ).toBe('me')
      // The candidate and preferences extras share the profile column.
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.preferredName') AS value FROM career_profile WHERE id = 1",
        ).value,
      ).toBe('M')
      expect(
        jsonColumn(
          sqlite,
          "SELECT json_extract(extension_json, '$.visaNote') AS value FROM career_profile WHERE id = 1",
        ).value,
      ).toBe('z')

      // Document roots: only unmodelled keys, with nested values still objects.
      expect(
        jsonColumn(
          sqlite,
          `SELECT json_type(documents_json, '$."candidate.json".identity') AS value FROM career_profile WHERE id = 1`,
        ).value,
      ).toBeNull()
      expect(
        jsonColumn(
          sqlite,
          `SELECT json_extract(documents_json, '$."candidate.json".lastUpdated') AS value FROM career_profile WHERE id = 1`,
        ).value,
      ).toBe('2026-10-01')
      expect(
        jsonColumn(
          sqlite,
          `SELECT json_type(documents_json, '$."portfolio-content.json".jobSearch') AS value FROM career_profile WHERE id = 1`,
        ).value,
      ).toBe('object')
      expect(
        jsonColumn(
          sqlite,
          `SELECT json_extract(documents_json, '$."portfolio-content.json".jobSearch.titles[1]') AS value FROM career_profile WHERE id = 1`,
        ).value,
      ).toBe('b')
      expect(
        jsonColumn(
          sqlite,
          `SELECT json_type(documents_json, '$."portfolio-content.json".levelDefinitions.senior') AS value FROM career_profile WHERE id = 1`,
        ).value,
      ).toBe('object')

      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })

  test('leaves an empty 0028 database with the new columns and no singleton', () => {
    const folder = migrationFolderUpTo(28)
    const sqlite = migratedDatabase(folder)
    try {
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
      const tables = tableNames(sqlite)
      expect(tables).toHaveLength(38)
      expect(tables).not.toContain('career_state')
      const columns = (table: string) =>
        sqlite
          .query(`PRAGMA table_info('${table}')`)
          .all()
          .map((row) => String((row as { name: string }).name))
      expect(columns('career_profile')).toContain('documents_json')
      expect(columns('career_profile')).toContain('extension_json')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})
