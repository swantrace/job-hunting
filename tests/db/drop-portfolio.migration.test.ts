import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedDatabase, migrationFolderUpTo, removeTempDir } from './support/migrations'

/**
 * Migration 0028 contract: the unused portfolio-topic feature is removed.
 *
 * This suite builds a database at 0027 (39 application tables), seeds career
 * facts and direction links — including a portfolio-topic record type that 0028
 * no longer supports — then applies `./drizzle` and checks that:
 *
 * - the two portfolio tables are gone and the schema has 37 application tables;
 * - `career_record_directions` was rebuilt without `topic_id` and without its
 *   topic partial unique index, keeping the four remaining partial indexes;
 * - every career row count is unchanged;
 * - every one of the 104 seeded direction links (all owned by the four surviving
 *   record types) survives, because the frozen migration only copies rows whose
 *   `topic_id is null`;
 * - `integrity_check` and `foreign_key_check` are clean.
 */

const T = '2026-10-14T00:00:00.000Z'

/** Direction links per record type, and the five record types that own them. */
const LINKS_PER_RECORD = 21
const FIRST_RECORD_TYPES = ['achievement', 'project', 'story', 'publication'] as const
/** The fifth record type, whose links the frozen migration deliberately drops. */
const TOPIC_LINKS = 20
const RECORD_COUNT = 5
/** Rows seeded into each cross-record junction table. */
const LINKED_PAIRS = 4

const directionKeys = ['fullstack', 'data', 'frontend', 'platform', 'security'] as const

/** Career tables whose row counts must survive 0028, with the expected count. */
const preservedCareerCounts: ReadonlyArray<[string, number]> = [
  ['career_directions', 5],
  ['career_education', 3],
  ['career_experiences', 2],
  ['career_achievements', RECORD_COUNT],
  ['career_projects', RECORD_COUNT],
  ['career_stories', RECORD_COUNT],
  ['career_publications', RECORD_COUNT],
  ['career_skills', 3],
  ['career_achievement_skills', 4],
  ['career_project_skills', 4],
  ['career_publication_projects', 4],
  ['career_achievement_publications', 4],
  ['career_base_resumes', 2],
]

function count(sqlite: ReturnType<typeof migratedDatabase>, table: string): number {
  return (sqlite.query(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count
}

function tableNames(sqlite: ReturnType<typeof migratedDatabase>): string[] {
  return sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all()
    .map((row) => String((row as { name: string }).name))
}

function columnNames(sqlite: ReturnType<typeof migratedDatabase>, table: string): string[] {
  return sqlite
    .query(`PRAGMA table_info('${table}')`)
    .all()
    .map((row) => String((row as { name: string }).name))
}

/** One exclusive-arc row per direction link, labelled by its owning record. */
function directionLinks(sqlite: ReturnType<typeof migratedDatabase>) {
  return sqlite
    .query(
      `SELECT direction_key, position,
        CASE
          WHEN achievement_id IS NOT NULL THEN 'achievement:' || achievement_id
          WHEN project_id IS NOT NULL THEN 'project:' || project_id
          WHEN story_id IS NOT NULL THEN 'story:' || story_id
          WHEN publication_id IS NOT NULL THEN 'publication:' || publication_id
        END AS record
       FROM career_record_directions ORDER BY id`,
    )
    .all() as Array<{ direction_key: string; record: string | null; position: number }>
}

/** Seeds a 0027 database with career facts and 104 direction links. */
function seedCareerFacts(sqlite: ReturnType<typeof migratedDatabase>) {
  const insertSkill = sqlite.query(
    `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
     VALUES (?, ?, NULL, 'approved', 'career-data', ?, ?) RETURNING id`,
  )
  const skillIds = Array.from({ length: 3 }, (_, index) => {
    const skill = insertSkill.get(`skill-${index + 1}`, `Skill ${index + 1}`, T, T) as {
      id: number
    }
    return skill.id
  })

  for (const [index, key] of directionKeys.entries()) {
    sqlite
      .query(
        `INSERT INTO career_directions (key, label, target_titles_json, sort_order, created_at, updated_at)
         VALUES (?, ?, '[]', ?, ?, ?)`,
      )
      .run(key, `Direction ${index + 1}`, index, T, T)
  }

  // `career_state` already carries its singleton row from 0026; `career_profile`
  // is empty until a candidate is saved.
  sqlite
    .query(
      `UPDATE career_state SET revision = 3, content_hash = 'hash', updated_at = ? WHERE id = 1`,
    )
    .run(T)
  sqlite
    .query(
      `INSERT INTO career_profile (id, full_name, email, revision, created_at, updated_at)
       VALUES (1, 'Migration Candidate', 'migration@example.test', 3, ?, ?)`,
    )
    .run(T, T)

  const insertEducation = sqlite.query(
    `INSERT INTO career_education (stable_key, degree, school, created_at, updated_at)
     VALUES (?, ?, 'Example Institute', ?, ?)`,
  )
  for (let index = 1; index <= 3; index += 1)
    insertEducation.run(`edu-${index}`, `Degree ${index}`, T, T)

  const insertExperience = sqlite.query(
    `INSERT INTO career_experiences (stable_key, company, role, created_at, updated_at) VALUES (?, ?, 'Engineer', ?, ?)`,
  )
  insertExperience.run('exp-1', 'Company One', T, T)
  insertExperience.run('exp-2', 'Company Two', T, T)

  const insertAchievement = sqlite.query(
    `INSERT INTO career_achievements (stable_key, claim, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id`,
  )
  const achievementIds = Array.from({ length: RECORD_COUNT }, (_, index) => {
    const row = insertAchievement.get(`ach-${index + 1}`, `Claim ${index + 1}.`, T, T) as {
      id: number
    }
    return row.id
  })

  const insertProject = sqlite.query(
    `INSERT INTO career_projects (stable_key, name, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id`,
  )
  const projectIds = Array.from({ length: RECORD_COUNT }, (_, index) => {
    const row = insertProject.get(`proj-${index + 1}`, `Project ${index + 1}`, T, T) as {
      id: number
    }
    return row.id
  })

  const insertStory = sqlite.query(
    `INSERT INTO career_stories (stable_key, title, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id`,
  )
  const storyIds = Array.from({ length: RECORD_COUNT }, (_, index) => {
    const row = insertStory.get(`story-${index + 1}`, `Story ${index + 1}`, T, T) as { id: number }
    return row.id
  })

  const insertPublication = sqlite.query(
    `INSERT INTO career_publications (stable_key, title, citation, year, status, created_at, updated_at)
     VALUES (?, ?, 'Example citation.', 2025, 'published', ?, ?) RETURNING id`,
  )
  const publicationIds = Array.from({ length: RECORD_COUNT }, (_, index) => {
    const row = insertPublication.get(`pub-${index + 1}`, `Paper ${index + 1}`, T, T) as {
      id: number
    }
    return row.id
  })

  const insertTopic = sqlite.query(
    `INSERT INTO career_portfolio_topics (stable_key, title, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id`,
  )
  const topicIds = Array.from({ length: RECORD_COUNT }, (_, index) => {
    const row = insertTopic.get(`topic-${index + 1}`, `Topic ${index + 1}`, T, T) as { id: number }
    return row.id
  })

  for (const skillId of skillIds) {
    sqlite
      .query(
        `INSERT INTO career_skills (skill_id, level, created_at, updated_at) VALUES (?, 'expert', ?, ?)`,
      )
      .run(skillId, T, T)
  }
  for (let index = 0; index < LINKED_PAIRS; index += 1) {
    sqlite
      .query(
        'INSERT INTO career_achievement_skills (achievement_id, skill_id, position) VALUES (?, ?, 0)',
      )
      .run(achievementIds[index], skillIds[index % 3])
    sqlite
      .query('INSERT INTO career_project_skills (project_id, skill_id, position) VALUES (?, ?, 0)')
      .run(projectIds[index], skillIds[index % 3])
    sqlite
      .query(
        'INSERT INTO career_publication_projects (publication_id, project_id, position) VALUES (?, ?, 0)',
      )
      .run(publicationIds[index], projectIds[index])
    sqlite
      .query(
        'INSERT INTO career_achievement_publications (achievement_id, publication_id, position) VALUES (?, ?, 0)',
      )
      .run(achievementIds[index], publicationIds[index])
    sqlite
      .query(
        'INSERT INTO career_portfolio_topic_projects (topic_id, project_id, position) VALUES (?, ?, 0)',
      )
      .run(topicIds[index], projectIds[index])
  }

  // 21 links per surviving record type (84) plus 20 topic links: exactly 104.
  // At 0027 the five per-record tables are already folded into the exclusive-arc
  // `career_record_directions` table, which still has `topic_id`. A link is
  // unique per (record, direction), so both ids and directions cycle separately.
  const insertLink = (column: string) =>
    sqlite.query(
      `INSERT INTO career_record_directions (${column}, direction_key, position) VALUES (?, ?, ?)`,
    )
  const recordLinks: Array<[string, number[]]> = [
    ['achievement_id', achievementIds],
    ['project_id', projectIds],
    ['story_id', storyIds],
    ['publication_id', publicationIds],
  ]
  for (const [column, ids] of recordLinks) {
    const insert = insertLink(column)
    for (let index = 0; index < LINKS_PER_RECORD; index += 1) {
      insert.run(
        ids[index % ids.length],
        directionKeys[Math.floor(index / ids.length) % directionKeys.length],
        index,
      )
    }
  }
  // 5 topics x 4 directions = exactly 20 topic links, so the 0028 filter drops
  // 20 of the 104 seeded links and keeps the 84 owned by surviving records.
  const insertTopicLink = insertLink('topic_id')
  for (let index = 0; index < TOPIC_LINKS; index += 1) {
    insertTopicLink.run(
      topicIds[index % topicIds.length],
      directionKeys[Math.floor(index / topicIds.length)],
      index,
    )
  }

  const insertBaseResume = sqlite.query(
    `INSERT INTO career_base_resumes (
       direction_key, version, status, markdown, content_hash, approved_at, created_at, updated_at
     ) VALUES (?, ?, 'approved', '# Approved', ?, ?, ?, ?)`,
  )
  insertBaseResume.run('fullstack', 'v1', 'hash-1', T, T, T)
  insertBaseResume.run('data', 'v1', 'hash-2', T, T, T)
}

describe('portfolio removal migration (0028)', () => {
  test('drops the portfolio tables and the topic link while preserving every career row', () => {
    const folder = migrationFolderUpTo(27)
    const sqlite = migratedDatabase(folder)
    try {
      seedCareerFacts(sqlite)
      const before = new Map(preservedCareerCounts.map(([table]) => [table, count(sqlite, table)]))
      for (const [table, expected] of preservedCareerCounts) {
        expect(count(sqlite, table)).toBe(expected)
      }
      expect(count(sqlite, 'career_record_directions')).toBe(104)
      expect(count(sqlite, 'career_portfolio_topics')).toBe(RECORD_COUNT)
      expect(count(sqlite, 'career_portfolio_topic_projects')).toBe(LINKED_PAIRS)
      expect(columnNames(sqlite, 'career_record_directions')).toContain('topic_id')

      // Apply only the frozen 0028 migration on top of the 0027 database.
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      // 1. The portfolio tables are gone and the schema has 37 application tables.
      const tables = tableNames(sqlite)
      expect(tables).not.toContain('career_portfolio_topics')
      expect(tables).not.toContain('career_portfolio_topic_projects')
      expect(tables).toHaveLength(37)

      // 2. The rebuilt junction has no topic column and no topic unique index;
      //    the four remaining partial unique indexes are recreated.
      expect(columnNames(sqlite, 'career_record_directions')).toEqual([
        'id',
        'direction_key',
        'achievement_id',
        'project_id',
        'story_id',
        'publication_id',
        'position',
      ])
      expect(
        sqlite
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'career_record_directions%' ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: 'career_record_directions_achievement_unique_idx' },
        { name: 'career_record_directions_project_unique_idx' },
        { name: 'career_record_directions_publication_unique_idx' },
        { name: 'career_record_directions_story_unique_idx' },
      ])

      // 3. Every career row count survives.
      for (const [table, expected] of preservedCareerCounts) {
        expect(count(sqlite, table)).toBe(before.get(table) ?? -1)
        expect(count(sqlite, table)).toBe(expected)
      }

      // 4. The migration copies exactly the rows whose `topic_id is null`: all
      //    84 links owned by the four surviving record types, and none of the 20
      //    topic links. Nothing else is disturbed.
      expect(count(sqlite, 'career_record_directions')).toBe(104 - TOPIC_LINKS)
      const links = directionLinks(sqlite)
      expect(links).toHaveLength(104 - TOPIC_LINKS)
      expect(links.every((link) => link.record !== null)).toBe(true)
      expect(links[0]).toEqual({ direction_key: 'fullstack', position: 0, record: 'achievement:1' })
      expect(links[3]).toEqual({ direction_key: 'fullstack', position: 3, record: 'achievement:4' })
      expect(links.at(-1)).toEqual({
        direction_key: 'security',
        position: 20,
        record: 'publication:1',
      })
      const perType = new Map<string, number>()
      for (const link of links) {
        const type = String(link.record).split(':')[0] as string
        perType.set(type, (perType.get(type) ?? 0) + 1)
      }
      expect([...perType.keys()].sort()).toEqual([...FIRST_RECORD_TYPES].sort())
      expect([...perType.values()]).toEqual([
        LINKS_PER_RECORD,
        LINKS_PER_RECORD,
        LINKS_PER_RECORD,
        LINKS_PER_RECORD,
      ])

      // 5. Integrity is clean after the rebuild.
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})
