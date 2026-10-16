import type { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  createCareerAchievement,
  createCareerProject,
  createCareerPublication,
  listCareerAchievements,
  listCareerProjects,
  listCareerPublications,
  restoreCareerAchievement,
  restoreCareerProject,
  retireCareerAchievement,
  retireCareerExperience,
  retireCareerProject,
  updateCareerAchievement,
  updateCareerProject,
} from '../../src/db/career-records'
import { CareerReferenceError, CareerRevisionConflictError } from '../../src/db/career-shared'
import {
  createCareerSkill,
  listCareerSkills,
  restoreCareerSkill,
  retireCareerSkill,
} from '../../src/db/career-skills'
import * as schema from '../../src/db/schema'
import {
  careerEvidenceIds,
  documentSafeCareerData,
  loadCareerDataFromDatabase,
} from '../../src/lib/career/canonical-data'
import { safeCareerData } from '../../src/lib/document-draft/input'
import { migratedDatabase } from '../support/sqlite'

/**
 * data contracts. Achievements, projects and personal skills must keep
 * their ordered junctions, reject retired or unapproved references, exclude
 * unsafe and resume-ineligible records from every document input, and never let
 * a personal skill create a catalog entry (or the reverse). Every database here
 * is an in-memory database migrated from `drizzle/`, never the developer's
 * `jobs.db`.
 */
function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

function seedDirection(sqlite: Database, key = 'fullstack', label = 'Full-Stack Developer') {
  sqlite
    .query(
      `INSERT INTO career_directions (key, label, target_titles_json, created_at, updated_at)
    VALUES (?, ?, '["Full-Stack Developer"]', 'T', 'T')`,
    )
    .run(key, label)
}

function seedSkill(
  sqlite: Database,
  key: string,
  name: string,
  reviewStatus = 'approved',
): { id: number } {
  return sqlite
    .query(
      `INSERT INTO skills (key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at)
    VALUES (?, ?, NULL, ?, 'manual', NULL, 'T', 'T') RETURNING id`,
    )
    .get(key, name, reviewStatus) as { id: number }
}

function seedExperience(sqlite: Database, stableKey: string): { id: number } {
  return sqlite
    .query(
      `INSERT INTO career_experiences (stable_key, company, role, created_at, updated_at)
    VALUES (?, 'Northwind Analytics', 'Senior Developer', 'T', 'T') RETURNING id`,
    )
    .get(stableKey) as { id: number }
}

function seedPublication(db: ReturnType<typeof drizzle<typeof schema>>, stableKey: string): number {
  return createCareerPublication(db, {
    stableKey,
    title: 'Synthetic publication',
    citation: 'Example, 2026.',
    year: 2026,
    status: 'published',
    safeToUse: true,
    authors: [{ name: 'Example Author', isCandidate: true }],
  }).id
}

describe('ordered junction roundtrip', () => {
  test('an achievement keeps skills, directions and publications in position order', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite, 'fullstack')
      seedDirection(sqlite, 'frontend')
      const first = seedSkill(sqlite, 'typescript', 'TypeScript')
      const second = seedSkill(sqlite, 'sqlite', 'SQLite')
      const experience = seedExperience(sqlite, 'northwind')
      const publication = seedPublication(db, 'synthetic-preprint')

      const created = createCareerAchievement(db, {
        stableKey: 'reporting-api-delivery',
        experienceId: experience.id,
        claim: 'Delivered a synthetic reporting API.',
        safeToUse: true,
        evidence: ['review notes'],
        evidenceNarratives: ['A narrative.'],
        limitations: ['Synthetic only.'],
        skills: [second.id, first.id],
        directions: ['frontend', 'fullstack'],
        publicationIds: [publication],
      })

      const record = listCareerAchievements(db).find((row) => row.id === created.id)
      expect(record?.skills).toEqual([second.id, first.id])
      expect(record?.directions).toEqual(['frontend', 'fullstack'])
      expect(record?.publicationIds).toEqual([publication])
      expect(record?.evidenceNarratives).toEqual(['A narrative.'])

      // Junction rows keep the same positions the arrays were saved with.
      const positions = sqlite
        .query(
          'SELECT skill_id, position FROM career_achievement_skills WHERE achievement_id = ? ORDER BY position',
        )
        .all(created.id) as Array<{ skill_id: number; position: number }>
      expect(positions).toEqual([
        { skill_id: second.id, position: 0 },
        { skill_id: first.id, position: 1 },
      ])

      // Replacing the links wholesale swaps them without leaving stale rows.
      updateCareerAchievement(
        db,
        created.id,
        {
          stableKey: 'reporting-api-delivery',
          experienceId: experience.id,
          claim: 'Delivered a synthetic reporting API.',
          safeToUse: true,
          evidence: ['review notes'],
          evidenceNarratives: ['A narrative.'],
          limitations: ['Synthetic only.'],
          skills: [first.id],
          directions: ['fullstack'],
          publicationIds: [],
        },
        { expectedRevision: 1 },
      )
      const updated = listCareerAchievements(db).find((row) => row.id === created.id)
      expect(updated?.skills).toEqual([first.id])
      expect(updated?.directions).toEqual(['fullstack'])
      expect(updated?.publicationIds).toEqual([])
      expect(
        sqlite.query('SELECT count(*) AS count FROM career_achievement_publications').get(),
      ).toEqual({ count: 0 })
    } finally {
      sqlite.close()
    }
  })

  test('a project keeps skills and directions in position order', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite, 'fullstack')
      const first = seedSkill(sqlite, 'typescript', 'TypeScript')
      const second = seedSkill(sqlite, 'sqlite', 'SQLite')
      const experience = seedExperience(sqlite, 'northwind')

      const created = createCareerProject(db, {
        stableKey: 'synthetic-tracker',
        name: 'Synthetic Tracker',
        experienceId: experience.id,
        ownership: 'personal',
        eligibility: 'resume-eligible',
        urls: ['https://example.test/synthetic-tracker'],
        limitations: ['Synthetic only.'],
        skills: [second.id, first.id],
        directions: ['fullstack'],
      })

      const record = listCareerProjects(db).find((row) => row.id === created.id)
      expect(record?.skills).toEqual([second.id, first.id])
      expect(record?.directions).toEqual(['fullstack'])
      expect(record?.urls).toEqual(['https://example.test/synthetic-tracker'])
    } finally {
      sqlite.close()
    }
  })
})

describe('retired and unapproved references are rejected', () => {
  test('a retired experience cannot be linked by an achievement or a project', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite, 'fullstack')
      const experience = seedExperience(sqlite, 'northwind')
      const achievement = createCareerAchievement(db, {
        stableKey: 'first',
        experienceId: experience.id,
        claim: 'First claim.',
      })
      const project = createCareerProject(db, {
        stableKey: 'first-project',
        name: 'First project',
        experienceId: experience.id,
      })
      retireCareerExperience(db, experience.id)

      expect(() =>
        createCareerAchievement(db, {
          stableKey: 'second',
          experienceId: experience.id,
          claim: 'Second claim.',
        }),
      ).toThrow(/retired/i)
      expect(() =>
        createCareerProject(db, {
          stableKey: 'second-project',
          name: 'Second project',
          experienceId: experience.id,
        }),
      ).toThrow(/retired/i)
      expect(() =>
        updateCareerAchievement(
          db,
          achievement.id,
          { stableKey: 'first', experienceId: experience.id, claim: 'Edited claim.' },
          { expectedRevision: 1 },
        ),
      ).toThrow(/retired/i)
      expect(() =>
        updateCareerProject(
          db,
          project.id,
          { stableKey: 'first-project', name: 'Edited project', experienceId: experience.id },
          { expectedRevision: 1 },
        ),
      ).toThrow(/retired/i)
    } finally {
      sqlite.close()
    }
  })

  test('retired directions, projects and publications cannot be newly linked', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite, 'fullstack')
      const skill = seedSkill(sqlite, 'typescript', 'TypeScript')
      const project = createCareerProject(db, { stableKey: 'tracker', name: 'Tracker' })
      const publication = seedPublication(db, 'preprint')
      retireCareerProject(db, project.id)

      expect(() =>
        createCareerPublication(db, {
          stableKey: 'uses-retired-project',
          title: 'Title',
          citation: 'Citation',
          year: 2026,
          status: 'published',
          projectIds: [project.id],
        }),
      ).toThrow(/retired/i)

      // A retired direction is refused on a new record and on an edit.
      sqlite.query("UPDATE career_directions SET retired_at = 'T' WHERE key = 'fullstack'").run()
      expect(() =>
        createCareerProject(db, {
          stableKey: 'uses-retired-direction',
          name: 'Project',
          directions: ['fullstack'],
        }),
      ).toThrow(/retired/i)
      const kept = createCareerProject(db, { stableKey: 'kept-project', name: 'Kept' })
      expect(() =>
        updateCareerProject(
          db,
          kept.id,
          { stableKey: 'kept-project', name: 'Kept', directions: ['fullstack'] },
          { expectedRevision: 1 },
        ),
      ).toThrow(/retired/i)
      expect(skill.id).toBeGreaterThan(0)

      // A retired publication is refused as an achievement source link.
      sqlite.query("UPDATE career_publications SET retired_at = 'T' WHERE id = ?").run(publication)
      expect(() =>
        createCareerAchievement(db, {
          stableKey: 'uses-retired-publication',
          claim: 'Claim.',
          skills: [skill.id],
          publicationIds: [publication],
        }),
      ).toThrow(/retired/i)
    } finally {
      sqlite.close()
    }
  })

  test('only an approved catalog skill can back career evidence', () => {
    const { sqlite, db } = database()
    try {
      const approved = seedSkill(sqlite, 'typescript', 'TypeScript')
      const pending = seedSkill(sqlite, 'oauth', 'OAuth', 'pending')
      const rejected = seedSkill(sqlite, 'legacy', 'Legacy', 'rejected')
      expect(() =>
        createCareerAchievement(db, { stableKey: 'a', claim: 'Claim.', skills: [pending.id] }),
      ).toThrow(/not approved/i)
      expect(() =>
        createCareerProject(db, { stableKey: 'p', name: 'Project', skills: [rejected.id] }),
      ).toThrow(/not approved/i)
      expect(() =>
        createCareerProject(db, { stableKey: 'p', name: 'Project', skills: [approved.id] }),
      ).not.toThrow()
    } finally {
      sqlite.close()
    }
  })
})

describe('document inputs exclude unsafe, retired and ineligible sources', () => {
  test('retired achievements and projects leave the runtime career data but keep history', () => {
    const { sqlite, db } = database()
    try {
      const achievement = createCareerAchievement(db, {
        stableKey: 'retired-claim',
        claim: 'Retired claim.',
      })
      const project = createCareerProject(db, { stableKey: 'retired-project', name: 'Retired' })
      retireCareerAchievement(db, achievement.id)
      retireCareerProject(db, project.id)

      expect(loadCareerDataFromDatabase(db).achievements.achievements).toEqual([])
      expect(loadCareerDataFromDatabase(db).projects.projects).toEqual([])
      expect(listCareerAchievements(db, { includeRetired: true })).toHaveLength(1)
      expect(listCareerProjects(db, { includeRetired: true })).toHaveLength(1)

      restoreCareerAchievement(db, achievement.id)
      restoreCareerProject(db, project.id)
      expect(loadCareerDataFromDatabase(db).achievements.achievements).toHaveLength(1)
      expect(loadCareerDataFromDatabase(db).projects.projects).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })

  test('unsafe achievements and resume-ineligible projects never reach documents or evidence', () => {
    const { sqlite, db } = database()
    try {
      createCareerAchievement(db, { stableKey: 'safe', claim: 'Safe claim.', safeToUse: true })
      createCareerAchievement(db, {
        stableKey: 'unsafe',
        claim: 'Unsafe claim.',
        safeToUse: false,
      })
      createCareerProject(db, {
        stableKey: 'eligible',
        name: 'Eligible',
        eligibility: 'resume-eligible',
      })
      createCareerProject(db, {
        stableKey: 'ineligible',
        name: 'Ineligible',
        eligibility: 'not-eligible',
      })

      const data = loadCareerDataFromDatabase(db)
      expect(data.achievements.achievements.map((item) => item.id).sort()).toEqual([
        'safe',
        'unsafe',
      ])
      expect(data.projects.projects.map((item) => item.id).sort()).toEqual([
        'eligible',
        'ineligible',
      ])

      const evidence = careerEvidenceIds(data)
      expect([...evidence.achievement]).toEqual(['safe'])
      expect([...evidence.project]).toEqual(['eligible'])

      const safe = safeCareerData(data)
      expect(safe.achievements.map((item) => item.id)).toEqual(['safe'])
      expect(safe.projects.map((item) => item.id)).toEqual(['eligible'])
      expect(JSON.stringify(safe)).not.toContain('Unsafe claim.')
      expect(JSON.stringify(safe)).not.toContain('Ineligible')
    } finally {
      sqlite.close()
    }
  })

  test('private publication and project URLs are excluded from documents unless explicitly included', () => {
    const { sqlite, db } = database()
    try {
      createCareerPublication(db, {
        stableKey: 'private-preprint',
        title: 'Private preprint',
        citation: 'Example, 2026.',
        year: 2026,
        status: 'preprint',
        authors: [{ name: 'Example Candidate', isCandidate: true }],
        sourceUrls: ['https://example.test/private-publication'],
      })
      createCareerProject(db, {
        stableKey: 'private-project',
        name: 'Private project',
        eligibility: 'resume-eligible',
        urls: ['https://example.test/private-project'],
      })

      // The stored record and the runtime canonical read keep the private links.
      expect(listCareerPublications(db)[0]?.sourceUrls).toEqual([
        'https://example.test/private-publication',
      ])
      const data = loadCareerDataFromDatabase(db)
      expect(data.publications.publications[0]?.sourceUrls).toEqual([
        'https://example.test/private-publication',
      ])
      expect(data.projects.projects[0]?.urls).toEqual(['https://example.test/private-project'])

      // Every generated context derived from the safe shape excludes them.
      const safe = documentSafeCareerData(data)
      expect(safe.publications[0]?.sourceUrls).toEqual([])
      expect(safe.projects[0]?.urls).toEqual([])
      expect(JSON.stringify(safe)).not.toContain('private-publication')
      expect(JSON.stringify(safe.projects)).not.toContain('https://example.test/private-project')

      // The explicit opt-in still exposes them.
      const optedIn = documentSafeCareerData(data, { includeSourceUrls: true })
      expect(optedIn.publications[0]?.sourceUrls).toEqual([
        'https://example.test/private-publication',
      ])
      expect(optedIn.projects[0]?.urls).toEqual(['https://example.test/private-project'])
    } finally {
      sqlite.close()
    }
  })
})

describe('personal skills stay separate from the catalog', () => {
  test('creating a personal skill never creates a catalog entry, and the reverse', () => {
    const { sqlite, db } = database()
    try {
      const approved = seedSkill(sqlite, 'typescript', 'TypeScript')
      const before = sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number }
      const created = createCareerSkill(db, {
        skillId: approved.id,
        level: 'advanced',
        resumeEligible: true,
        explanation: 'Used daily.',
        evidence: ['Delivered the reporting API.'],
      })
      expect(sqlite.query('SELECT count(*) AS count FROM skills').get()).toEqual(before)
      expect(listCareerSkills(db)).toHaveLength(1)

      // A new catalog entry does not claim the candidate possesses it.
      seedSkill(sqlite, 'react', 'React')
      expect(listCareerSkills(db)).toHaveLength(1)
      expect(listCareerSkills(db).map((row) => row.skillName)).toEqual(['TypeScript'])

      // Retirement hides it from documents; restore reverses it.
      retireCareerSkill(db, created.id)
      expect(loadCareerDataFromDatabase(db).skills.skills).toEqual([])
      expect(listCareerSkills(db, { includeRetired: true })).toHaveLength(1)
      expect(restoreCareerSkill(db, created.id).changed).toBe(true)
      expect(loadCareerDataFromDatabase(db).skills.skills.map((row) => row.id)).toEqual([
        'typescript',
      ])
    } finally {
      sqlite.close()
    }
  })

  test('a personal skill requires an approved catalog entry', () => {
    const { sqlite, db } = database()
    try {
      const pending = seedSkill(sqlite, 'oauth', 'OAuth', 'pending')
      expect(() => createCareerSkill(db, { skillId: pending.id })).toThrow(/not approved/i)
      expect(listCareerSkills(db)).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})

describe('no-op and stale writes', () => {
  test('re-saving identical achievement content is invisible and a stale revision conflicts', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite, 'fullstack')
      const skill = seedSkill(sqlite, 'typescript', 'TypeScript')
      const input = {
        stableKey: 'reporting-api-delivery',
        claim: 'Delivered a synthetic reporting API.',
        safeToUse: true,
        evidence: ['review notes'],
        evidenceNarratives: ['A narrative.'],
        limitations: ['Synthetic only.'],
        skills: [skill.id],
        directions: ['fullstack'],
        publicationIds: [],
      }
      const created = createCareerAchievement(db, input)
      const noop = updateCareerAchievement(db, created.id, input)
      expect(noop).toEqual({ id: created.id, changed: false, revision: 1 })

      expect(() =>
        updateCareerAchievement(
          db,
          created.id,
          { ...input, claim: 'Changed claim.' },
          { expectedRevision: 99 },
        ),
      ).toThrow(CareerRevisionConflictError)
      expect(() =>
        updateCareerAchievement(
          db,
          created.id,
          { ...input, claim: 'Changed claim.' },
          { expectedRevision: 1 },
        ),
      ).not.toThrow()
      expect(listCareerAchievements(db)[0]?.claim).toBe('Changed claim.')
    } finally {
      sqlite.close()
    }
  })

  test('a duplicate stable key is rejected with a reference error', () => {
    const { sqlite, db } = database()
    try {
      createCareerProject(db, { stableKey: 'tracker', name: 'Tracker' })
      expect(() => createCareerProject(db, { stableKey: 'tracker', name: 'Other' })).toThrow(
        CareerReferenceError,
      )
    } finally {
      sqlite.close()
    }
  })
})
