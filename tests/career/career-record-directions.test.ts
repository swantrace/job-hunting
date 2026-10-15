import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  createCareerAchievement,
  createCareerPortfolioTopic,
  createCareerProject,
  createCareerPublication,
  createCareerStory,
  listCareerAchievements,
  listCareerPortfolioTopics,
  listCareerProjects,
  listCareerPublications,
  listCareerStories,
} from '../../src/db/career-records'
import { CareerReferenceError } from '../../src/db/career-state'
import * as schema from '../../src/db/schema'
import { migratedDatabase } from '../support/sqlite'

const T = '2026-10-14T00:00:00.000Z'

function database() {
  const sqlite = migratedDatabase()
  const db = drizzle({ client: sqlite, schema })
  const insertDirection = sqlite.query(
    `INSERT INTO career_directions (key, label, target_titles_json, sort_order, retired_at, created_at, updated_at)
     VALUES (?, ?, '[]', 0, ?, ?, ?)`,
  )
  insertDirection.run('fullstack', 'Full-Stack', null, T, T)
  insertDirection.run('data', 'Data', null, T, T)
  insertDirection.run('retired', 'Retired', T, T, T)
  return { sqlite, db }
}

function directionKeys(
  sqlite: ReturnType<typeof database>['sqlite'],
  achievementId: number,
): string[] {
  return (
    sqlite
      .query(
        'SELECT direction_key FROM career_record_directions WHERE achievement_id = ? ORDER BY position',
      )
      .all(achievementId) as Array<{ direction_key: string }>
  ).map((row) => row.direction_key)
}

describe('career_record_directions exclusive arc', () => {
  test('round-trips one ordered direction list for each of the five record types', () => {
    const { sqlite, db } = database()
    try {
      const achievement = createCareerAchievement(db, {
        stableKey: 'ach-1',
        claim: 'Claim.',
        directions: ['data', 'fullstack'],
      })
      const project = createCareerProject(db, {
        stableKey: 'proj-1',
        name: 'Project',
        directions: ['data', 'fullstack'],
      })
      const story = createCareerStory(db, {
        stableKey: 'story-1',
        title: 'Story',
        directions: ['data', 'fullstack'],
      })
      const publication = createCareerPublication(db, {
        stableKey: 'pub-1',
        title: 'Paper',
        citation: 'Citation.',
        year: 2025,
        status: 'published',
        directions: ['data', 'fullstack'],
      })
      const topic = createCareerPortfolioTopic(db, {
        stableKey: 'topic-1',
        title: 'Topic',
        directions: ['data', 'fullstack'],
      })

      expect(listCareerAchievements(db)[0].directions).toEqual(['data', 'fullstack'])
      expect(listCareerProjects(db)[0].directions).toEqual(['data', 'fullstack'])
      expect(listCareerStories(db)[0].directions).toEqual(['data', 'fullstack'])
      expect(listCareerPublications(db)[0].directions).toEqual(['data', 'fullstack'])
      expect(listCareerPortfolioTopics(db)[0].directions).toEqual(['data', 'fullstack'])

      // One arc row per link, addressed by the right record column.
      expect(
        sqlite
          .query(
            'SELECT achievement_id, project_id, story_id, publication_id, topic_id, direction_key, position FROM career_record_directions ORDER BY id',
          )
          .all(),
      ).toEqual([
        {
          achievement_id: achievement.id,
          project_id: null,
          story_id: null,
          publication_id: null,
          topic_id: null,
          direction_key: 'data',
          position: 0,
        },
        {
          achievement_id: achievement.id,
          project_id: null,
          story_id: null,
          publication_id: null,
          topic_id: null,
          direction_key: 'fullstack',
          position: 1,
        },
        {
          achievement_id: null,
          project_id: project.id,
          story_id: null,
          publication_id: null,
          topic_id: null,
          direction_key: 'data',
          position: 0,
        },
        {
          achievement_id: null,
          project_id: project.id,
          story_id: null,
          publication_id: null,
          topic_id: null,
          direction_key: 'fullstack',
          position: 1,
        },
        {
          achievement_id: null,
          project_id: null,
          story_id: story.id,
          publication_id: null,
          topic_id: null,
          direction_key: 'data',
          position: 0,
        },
        {
          achievement_id: null,
          project_id: null,
          story_id: story.id,
          publication_id: null,
          topic_id: null,
          direction_key: 'fullstack',
          position: 1,
        },
        {
          achievement_id: null,
          project_id: null,
          story_id: null,
          publication_id: publication.id,
          topic_id: null,
          direction_key: 'data',
          position: 0,
        },
        {
          achievement_id: null,
          project_id: null,
          story_id: null,
          publication_id: publication.id,
          topic_id: null,
          direction_key: 'fullstack',
          position: 1,
        },
        {
          achievement_id: null,
          project_id: null,
          story_id: null,
          publication_id: null,
          topic_id: topic.id,
          direction_key: 'data',
          position: 0,
        },
        {
          achievement_id: null,
          project_id: null,
          story_id: null,
          publication_id: null,
          topic_id: topic.id,
          direction_key: 'fullstack',
          position: 1,
        },
      ])
    } finally {
      sqlite.close()
    }
  })

  test('the exactly-one CHECK rejects a row that sets two record columns', () => {
    const { sqlite, db } = database()
    try {
      const achievement = createCareerAchievement(db, { stableKey: 'ach-1', claim: 'Claim.' })
      const project = createCareerProject(db, { stableKey: 'proj-1', name: 'Project' })

      expect(() =>
        sqlite
          .query(
            `INSERT INTO career_record_directions (direction_key, achievement_id, project_id, position)
             VALUES ('fullstack', ?, ?, 0)`,
          )
          .run(achievement.id, project.id),
      ).toThrow(/career_record_directions_exactly_one_check/)
      expect(sqlite.query('SELECT count(*) AS count FROM career_record_directions').get()).toEqual({
        count: 0,
      })
    } finally {
      sqlite.close()
    }
  })

  test('dedupes a direction repeated in one record list instead of failing', () => {
    const { sqlite, db } = database()
    try {
      const achievement = createCareerAchievement(db, {
        stableKey: 'ach-1',
        claim: 'Claim.',
        directions: ['fullstack', 'fullstack', 'data'],
      })

      expect(listCareerAchievements(db)[0].directions).toEqual(['fullstack', 'data'])
      expect(directionKeys(sqlite, achievement.id)).toEqual(['fullstack', 'data'])
    } finally {
      sqlite.close()
    }
  })

  test('rejects an unknown or retired direction key', () => {
    const { sqlite, db } = database()
    try {
      expect(() =>
        createCareerAchievement(db, {
          stableKey: 'ach-1',
          claim: 'Claim.',
          directions: ['retired'],
        }),
      ).toThrow(/retired/)
      expect(() =>
        createCareerAchievement(db, {
          stableKey: 'ach-2',
          claim: 'Claim.',
          directions: ['unknown'],
        }),
      ).toThrow(CareerReferenceError)
      expect(sqlite.query('SELECT count(*) AS count FROM career_record_directions').get()).toEqual({
        count: 0,
      })
    } finally {
      sqlite.close()
    }
  })
})
