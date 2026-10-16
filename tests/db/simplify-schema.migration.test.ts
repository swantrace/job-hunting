import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedDatabase, migrationFolderUpTo, removeTempDir } from './support/migrations'

/**
 * Migration 0027 contract: the simplification must preserve every career row
 * and direction link while discarding the disposable job-search history and the
 * unreferenced parser catalog. This suite builds a database at 0026, seeds
 * synthetic career + operational rows with raw SQL (the application schema
 * already describes 0027), then applies `./drizzle` and checks the outcome.
 */

const T = '2026-10-14T00:00:00.000Z'

/** Every 0026 career table whose row count must survive 0027. */
const preservedCareerTables = [
  'career_directions',
  'career_education',
  'career_experiences',
  'career_achievements',
  'career_projects',
  'career_stories',
  'career_publications',
  'career_skills',
  'career_achievement_skills',
  'career_project_skills',
  'career_publication_projects',
  'career_achievement_publications',
  'career_base_resumes',
] as const

/** Operational tables 0027 empties. */
const wipedOperationalTables = [
  'companies',
  'contacts',
  'job_applications',
  'job_applications_to_contacts',
  'job_postings',
  'job_posting_analyses',
  'job_requirements',
  'job_requirement_skill_mentions',
  'application_analysis_runs',
  'analysis_run_decisions',
  'generation_runs',
  'generated_artifacts',
  'document_reviews',
  'job_intake_batches',
  'job_intake_items',
  'follow_ups',
  'interviews',
] as const

/** Tables 0027 drops outright. */
const droppedTables = [
  'baseline_generation_runs',
  'baseline_generated_artifacts',
  'baseline_generation_results',
  'baseline_generation_evidence_snapshots',
  'generation_run_results',
  'generation_evidence_snapshots',
  'career_candidate',
  'career_preferences',
  'career_achievement_directions',
  'career_project_directions',
  'career_story_directions',
  'career_publication_directions',
  'career_portfolio_topic_directions',
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

/** One exclusive-arc row per direction link, labelled by its owning record. */
function directionLinks(sqlite: Database) {
  return sqlite
    .query(
      `SELECT direction_key, position,
        CASE
          WHEN achievement_id IS NOT NULL THEN 'achievement:' || achievement_id
          WHEN project_id IS NOT NULL THEN 'project:' || project_id
          WHEN story_id IS NOT NULL THEN 'story:' || story_id
          ELSE 'publication:' || publication_id
        END AS record
       FROM career_record_directions ORDER BY id`,
    )
    .all() as Array<{ direction_key: string; record: string; position: number }>
}

function seedCareerFacts(sqlite: Database) {
  const insertSkill = sqlite.query(
    `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?) RETURNING id`,
  )
  const typescript = insertSkill.get(
    'typescript',
    'TypeScript',
    'approved',
    'career-data',
    T,
    T,
  ) as { id: number }
  insertSkill.get('react', 'React', 'approved', 'career-data', T, T)
  for (let index = 1; index <= 25; index += 1) {
    const parser = insertSkill.get(
      `parser-skill-${index}`,
      `Parser Skill ${index}`,
      'pending',
      'job-parser',
      T,
      T,
    ) as { id: number }
    sqlite
      .query(
        `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
         VALUES (?, ?, ?, 'job-parser', ?)`,
      )
      .run(parser.id, `Parser Alias ${index}`, `parser-alias-${index}`, T)
  }
  sqlite
    .query(
      `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
       VALUES (?, 'TS', 'ts', 'career-data', ?)`,
    )
    .run(typescript.id, T)

  for (const [key, label] of [
    ['fullstack', 'Full-Stack Developer'],
    ['data', 'Data Engineer'],
  ] as const) {
    sqlite
      .query(
        `INSERT INTO career_directions (key, label, target_titles_json, sort_order, created_at, updated_at)
         VALUES (?, ?, '[]', 0, ?, ?)`,
      )
      .run(key, label, T, T)
  }

  sqlite
    .query(
      `INSERT INTO career_candidate (
        id, full_name, email, authorization_json, revision, created_at, updated_at
      ) VALUES (1, 'Migration Candidate', 'migration@example.test', '{"notes":"auth"}', 3, ?, ?)`,
    )
    .run(T, T)
  sqlite
    .query(
      `INSERT INTO career_preferences (
        id, locations_json, work_modes_json, availability, compensation_json, notes, revision,
        created_at, updated_at
      ) VALUES (1, '["Edmonton, AB"]', '["remote"]', 'Two weeks notice', '{"currency":"CAD"}',
        'Preference note.', 2, ?, ?)`,
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
      `INSERT INTO career_experiences (stable_key, company, role, created_at, updated_at)
       VALUES ('exp-1', 'Example Co', 'Engineer', ?, ?)`,
    )
    .run(T, T)

  const insertAchievement = sqlite.query(
    `INSERT INTO career_achievements (stable_key, claim, created_at, updated_at)
     VALUES (?, ?, ?, ?) RETURNING id`,
  )
  const achievementOne = insertAchievement.get('ach-1', 'Shipped a thing.', T, T) as {
    id: number
  }
  const achievementTwo = insertAchievement.get('ach-2', 'Shipped another thing.', T, T) as {
    id: number
  }

  const insertProject = sqlite.query(
    `INSERT INTO career_projects (stable_key, name, created_at, updated_at)
     VALUES (?, ?, ?, ?) RETURNING id`,
  )
  const projectOne = insertProject.get('proj-1', 'Project One', T, T) as { id: number }
  insertProject.get('proj-2', 'Project Two', T, T)

  const story = sqlite
    .query(
      `INSERT INTO career_stories (stable_key, title, created_at, updated_at)
       VALUES ('story-1', 'Story One', ?, ?) RETURNING id`,
    )
    .get(T, T) as { id: number }
  const publication = sqlite
    .query(
      `INSERT INTO career_publications (stable_key, title, citation, year, status, created_at, updated_at)
       VALUES ('pub-1', 'Paper One', 'Example citation.', 2025, 'published', ?, ?) RETURNING id`,
    )
    .get(T, T) as { id: number }
  sqlite
    .query(
      `INSERT INTO career_skills (skill_id, level, created_at, updated_at) VALUES (?, 'expert', ?, ?)`,
    )
    .run(typescript.id, T, T)
  sqlite
    .query(
      'INSERT INTO career_achievement_skills (achievement_id, skill_id, position) VALUES (?, ?, 0)',
    )
    .run(achievementOne.id, typescript.id)
  sqlite
    .query(
      'INSERT INTO career_achievement_skills (achievement_id, skill_id, position) VALUES (?, ?, 0)',
    )
    .run(achievementTwo.id, typescript.id)
  sqlite
    .query('INSERT INTO career_project_skills (project_id, skill_id, position) VALUES (?, ?, 0)')
    .run(projectOne.id, typescript.id)
  sqlite
    .query(
      'INSERT INTO career_achievement_publications (achievement_id, publication_id, position) VALUES (?, ?, 0)',
    )
    .run(achievementOne.id, publication.id)
  sqlite
    .query(
      'INSERT INTO career_publication_projects (publication_id, project_id, position) VALUES (?, ?, 0)',
    )
    .run(publication.id, projectOne.id)

  // Direction links across all four surviving record types; the achievement
  // keeps two in editorial order.
  const insertDirection = sqlite.query(
    'INSERT INTO career_achievement_directions (achievement_id, direction_key, position) VALUES (?, ?, ?)',
  )
  insertDirection.run(achievementOne.id, 'fullstack', 0)
  insertDirection.run(achievementOne.id, 'data', 1)
  sqlite
    .query(
      'INSERT INTO career_project_directions (project_id, direction_key, position) VALUES (?, ?, 0)',
    )
    .run(projectOne.id, 'fullstack')
  sqlite
    .query(
      'INSERT INTO career_story_directions (story_id, direction_key, position) VALUES (?, ?, 0)',
    )
    .run(story.id, 'data')
  sqlite
    .query(
      'INSERT INTO career_publication_directions (publication_id, direction_key, position) VALUES (?, ?, 0)',
    )
    .run(publication.id, 'fullstack')
  sqlite
    .query(
      `INSERT INTO career_base_resumes (
        direction_key, version, status, markdown, content_hash, approved_at, created_at, updated_at
      ) VALUES ('fullstack', 'v1', 'approved', '# Approved', 'hash-1', ?, ?, ?)`,
    )
    .run(T, T, T)

  return { typescriptSkillId: typescript.id }
}

function seedOperationalHistory(sqlite: Database, skillId: number) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Wiped Co', T, T) as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, 'Wiped Role', '2026-10-01', 'B', 'Applied', ?, ?) RETURNING id`,
    )
    .get(company.id, T, T) as { id: number }
  const contact = sqlite
    .query(
      "INSERT INTO contacts (company_id, name, created_at, updated_at) VALUES (?, 'Wiped Contact', ?, ?) RETURNING id",
    )
    .get(company.id, T, T) as { id: number }
  sqlite
    .query(
      'INSERT INTO job_applications_to_contacts (job_application_id, contact_id, created_at) VALUES (?, ?, ?)',
    )
    .run(application.id, contact.id, T)
  sqlite
    .query(
      `INSERT INTO follow_ups (job_application_id, action_date, action_type, created_at, updated_at)
       VALUES (?, '2026-10-02', 'email', ?, ?)`,
    )
    .run(application.id, T, T)
  sqlite
    .query(
      `INSERT INTO interviews (job_application_id, interview_date, round_name, round_type, created_at, updated_at)
       VALUES (?, '2026-10-03', 'Screen', 'phone', ?, ?)`,
    )
    .run(application.id, T, T)
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, version, raw_text, captured_at, content_hash)
       VALUES (?, 1, 'Wiped posting', ?, 'hash') RETURNING id`,
    )
    .get(application.id, T) as { id: number }
  const analysis = sqlite
    .query(
      `INSERT INTO job_posting_analyses (job_posting_id, status, created_at, updated_at, completed_at)
       VALUES (?, 'Completed', ?, ?, ?) RETURNING id`,
    )
    .get(posting.id, T, T, T) as { id: number }
  const requirement = sqlite
    .query(
      `INSERT INTO job_requirements (
        job_posting_analysis_id, sequence, requirement_type, importance, basis, statement, source_text,
        created_at, updated_at
      ) VALUES (?, 1, 'skill', 'required', 'explicit', 'Wiped requirement', 'src', ?, ?) RETURNING id`,
    )
    .get(analysis.id, T, T) as { id: number }
  sqlite
    .query(
      `INSERT INTO job_requirement_skill_mentions (
        job_requirement_id, raw_term, normalized_term, mapping_state, resolved_skill_id,
        occurrences_json, created_at, updated_at
      ) VALUES (?, 'TypeScript', 'typescript', 'mapped', ?, '[{"confidence":1}]', ?, ?)`,
    )
    .run(requirement.id, skillId, T, T)
  const run = sqlite
    .query(
      `INSERT INTO application_analysis_runs (job_posting_analysis_id, status, queue_job_id, created_at, updated_at)
       VALUES (?, 'Completed', 'wiped-run', ?, ?) RETURNING id`,
    )
    .get(analysis.id, T, T) as { id: number }
  sqlite
    .query(
      `INSERT INTO analysis_run_decisions (application_analysis_run_id, skill_id, decision, created_at, updated_at)
       VALUES (?, ?, 'skip', ?, ?)`,
    )
    .run(run.id, skillId, T, T)
  const generation = sqlite
    .query(
      `INSERT INTO generation_runs (
        application_analysis_run_id, status, queue_job_id, created_at, updated_at, completed_at
      ) VALUES (?, 'Completed', 'wiped-generation', ?, ?, ?) RETURNING id`,
    )
    .get(run.id, T, T, T) as { id: number }
  sqlite
    .query(
      `INSERT INTO generated_artifacts (generation_run_id, type, file_name, file_path, mime_type, created_at)
       VALUES (?, 'resume', 'wiped.docx', '/tmp/wiped.docx', 'application/msword', ?)`,
    )
    .run(generation.id, T)
  sqlite
    .query(
      `INSERT INTO document_reviews (generation_run_id, status, queue_job_id, created_at, updated_at)
       VALUES (?, 'Completed', 'wiped-review', ?, ?)`,
    )
    .run(generation.id, T, T)
  const batch = sqlite
    .query('INSERT INTO job_intake_batches (created_at, updated_at) VALUES (?, ?) RETURNING id')
    .get(T, T) as { id: number }
  sqlite
    .query(
      `INSERT INTO job_intake_items (batch_id, sequence, kind, raw, status, created_at, updated_at)
       VALUES (?, 1, 'text', 'Wiped intake', 'pending', ?, ?)`,
    )
    .run(batch.id, T, T)
  sqlite
    .query(
      `INSERT INTO google_drive_connections (id, refresh_token_encrypted, folder_id, created_at, updated_at)
       VALUES (1, 'kept-token', 'kept-folder', ?, ?)`,
    )
    .run(T, T)
}

describe('schema simplification migration (0027)', () => {
  test('preserves career facts, wipes operational history and prunes the parser catalog', () => {
    const folder = migrationFolderUpTo(26)
    const sqlite = migratedDatabase(folder)
    try {
      const seeded = seedCareerFacts(sqlite)
      seedOperationalHistory(sqlite, seeded.typescriptSkillId)

      const before = new Map(
        preservedCareerTables.map((table) => [table, count(sqlite, table)] as const),
      )
      expect(count(sqlite, 'skill_aliases')).toBe(26)
      expect(
        sqlite.query("SELECT count(*) AS count FROM skills WHERE origin = 'job-parser'").get(),
      ).toEqual({ count: 25 })

      // Apply only the frozen 0027 migration on top of the 0026 database.
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      // Every career row survives with the same count.
      for (const table of preservedCareerTables) {
        expect(count(sqlite, table)).toBe(before.get(table) ?? -1)
      }
      expect(count(sqlite, 'career_achievements')).toBe(2)
      expect(count(sqlite, 'career_record_directions')).toBe(5)
      expect(directionLinks(sqlite)).toEqual([
        { direction_key: 'fullstack', record: 'achievement:1', position: 0 },
        { direction_key: 'data', record: 'achievement:1', position: 1 },
        { direction_key: 'fullstack', record: 'project:1', position: 0 },
        { direction_key: 'data', record: 'story:1', position: 0 },
        { direction_key: 'fullstack', record: 'publication:1', position: 0 },
      ])

      // The merged singleton keeps both halves, with the newest revision.
      expect(
        sqlite
          .query(
            `SELECT full_name, email, authorization_json, locations_json, work_modes_json,
                    availability, notes, revision
             FROM career_profile`,
          )
          .get(),
      ).toEqual({
        full_name: 'Migration Candidate',
        email: 'migration@example.test',
        authorization_json: '{"notes":"auth"}',
        locations_json: '["Edmonton, AB"]',
        work_modes_json: '["remote"]',
        availability: 'Two weeks notice',
        notes: 'Preference note.',
        revision: 3,
      })

      // The parser leftovers and their aliases are gone; career skills stay.
      expect(
        sqlite.query("SELECT count(*) AS count FROM skills WHERE origin = 'job-parser'").get(),
      ).toEqual({ count: 0 })
      expect(count(sqlite, 'skills')).toBe(2)
      expect(count(sqlite, 'skill_aliases')).toBe(1)

      // Drive credentials survive the wipe.
      expect(
        sqlite
          .query('SELECT refresh_token_encrypted, folder_id FROM google_drive_connections')
          .all(),
      ).toEqual([{ refresh_token_encrypted: 'kept-token', folder_id: 'kept-folder' }])

      // Every operational table is empty and every superseded table is dropped.
      for (const table of wipedOperationalTables) expect(count(sqlite, table)).toBe(0)
      const tables = tableNames(sqlite)
      for (const table of droppedTables) expect(tables).not.toContain(table)

      // 36 application tables plus the junction as a view: 0027 left 39, 0028
      // dropped the two portfolio tables, and 0029 dissolved career_state.
      expect(tables).toHaveLength(37)
      expect(tables).not.toContain('career_state')
      expect(
        sqlite
          .query("SELECT type FROM sqlite_master WHERE name = 'job_requirements_to_skills'")
          .get(),
      ).toEqual({ type: 'view' })
      expect(
        sqlite.query('SELECT count(*) AS count FROM job_requirements_to_skills').get(),
      ).toEqual({ count: 0 })

      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})
