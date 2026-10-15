import type { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  approveBaseResumeVersion,
  assertBaseResumeImmutable,
  createBaseResumeDraft,
  readBaseResumeVersion,
  selectedApprovedBaseResume,
  supersedeBaseResumeVersion,
} from '../../src/db/career-base-resumes'
import {
  createCareerDirection,
  listCareerDirections,
  readCareerDirection,
  retireCareerDirection,
  updateCareerDirection,
} from '../../src/db/career-directions'
import {
  readCareerCandidate,
  readCareerPreferences,
  saveCareerCandidate,
  saveCareerPreferences,
} from '../../src/db/career-facts'
import {
  createCareerAchievement,
  createCareerEducation,
  createCareerProject,
  listCareerAchievements,
  listCareerProjects,
  restoreCareerAchievement,
  restoreCareerProject,
  retireCareerAchievement,
  retireCareerProject,
  updateCareerEducation,
} from '../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
  careerContentProbe,
} from '../../src/db/career-shared'
import { createCareerSkill, listCareerSkills, retireCareerSkill } from '../../src/db/career-skills'
import { assertDatabaseReady } from '../../src/db/health'
import * as schema from '../../src/db/schema'
import {
  countPendingMentions,
  listAnalysisMentions,
  listCanonicalSkillGroups,
  listRequirementMentions,
  mapMention,
  resetMention,
  skipMention,
  upsertPendingMention,
} from '../../src/db/skill-mentions'
import { baseResumeTextHash } from '../../src/lib/base-resumes'
import { migratedDatabase } from '../support/sqlite'
import {
  approvedBaseResumeMarkdown,
  draftBaseResumeMarkdown,
  seedPopulatedLegacyCatalog,
} from './fixtures'

/**
 * Step 2 repository contracts. Every database here is an in-memory database
 * migrated from `drizzle/`, never the developer's `jobs.db`.
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
  mergedIntoSkillId: number | null = null,
): { id: number } {
  return sqlite
    .query(
      `INSERT INTO skills (key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at)
       VALUES (?, ?, NULL, ?, 'manual', ?, 'T', 'T') RETURNING id`,
    )
    .get(key, name, reviewStatus, mergedIntoSkillId) as { id: number }
}

function educationRow(sqlite: Database, id: number) {
  return sqlite
    .query('SELECT revision, updated_at, retired_at, degree FROM career_education WHERE id = ?')
    .get(id) as { revision: number; updated_at: string; retired_at: string | null; degree: string }
}

const baseInput = {
  stableKey: 'edu-example-degree',
  degree: 'BSc Computer Science',
  school: 'Example Institute of Technology',
  startDate: '2016-09',
  endDate: '2020-04',
  datePrecision: 'month' as const,
  displayDates: '2016 - 2020',
  sortOrder: 1,
  coursework: ['Distributed Systems', 'Database Systems'],
  details: 'Synthetic coursework fixture.',
}

describe('revision semantics', () => {
  test('a real change bumps the row revision and the change probe, a no-op write is invisible', async () => {
    const { sqlite, db } = database()
    try {
      const emptyProbe = careerContentProbe(db)
      const created = createCareerEducation(db, baseInput)
      expect(created.changed).toBe(true)
      expect(created.revision).toBe(1)
      const afterCreate = careerContentProbe(db)
      expect(afterCreate).not.toBe(emptyProbe)
      const createdRow = educationRow(sqlite, created.id)

      const noop = updateCareerEducation(db, created.id, baseInput)
      expect(noop).toEqual({ id: created.id, changed: false, revision: 1 })
      expect(educationRow(sqlite, created.id)).toEqual(createdRow)
      expect(careerContentProbe(db)).toBe(afterCreate)

      // The probe's timestamp component has millisecond resolution, so a real
      // update is separated from the write before it to make the assertion
      // deterministic rather than clock-dependent.
      await Bun.sleep(2)
      const first = updateCareerEducation(db, created.id, { ...baseInput, degree: 'MSc Computing' })
      const afterFirst = careerContentProbe(db)
      await Bun.sleep(2)
      const second = updateCareerEducation(db, created.id, {
        ...baseInput,
        degree: 'PhD Computing',
      })
      expect(first.changed).toBe(true)
      expect(second.changed).toBe(true)
      expect([first.revision, second.revision]).toEqual([2, 3])
      expect(educationRow(sqlite, created.id).degree).toBe('PhD Computing')
      expect(careerContentProbe(db)).not.toBe(afterFirst)
      expect(careerContentProbe(db)).not.toBe('')
    } finally {
      sqlite.close()
    }
  })

  test('two same-day changes produce two revisions and two distinct probe fingerprints', async () => {
    const { sqlite, db } = database()
    try {
      const created = createCareerEducation(db, baseInput)
      const before = careerContentProbe(db)
      await Bun.sleep(2)
      updateCareerEducation(db, created.id, {
        ...baseInput,
        degree: 'BSc Computer Science (Honours)',
      })
      const middle = careerContentProbe(db)
      await Bun.sleep(2)
      updateCareerEducation(db, created.id, { ...baseInput, degree: 'MSc Computing' })
      const after = careerContentProbe(db)
      expect(new Set([before, middle, after]).size).toBe(3)
      expect(educationRow(sqlite, created.id).revision).toBe(3)
    } finally {
      sqlite.close()
    }
  })
})

describe('stable key identity', () => {
  test('stable_key survives a display rename and duplicate keys are rejected', () => {
    const { sqlite, db } = database()
    try {
      const created = createCareerEducation(db, baseInput)
      const renamed = updateCareerEducation(db, created.id, {
        ...baseInput,
        degree: 'BSc Computer Science, Honours',
        school: 'Renamed Institute',
      })
      expect(renamed.changed).toBe(true)
      const row = sqlite
        .query('SELECT stable_key, degree, school FROM career_education WHERE id = ?')
        .get(created.id)
      expect(row).toEqual({
        stable_key: 'edu-example-degree',
        degree: 'BSc Computer Science, Honours',
        school: 'Renamed Institute',
      })
      expect(() => createCareerEducation(db, baseInput)).toThrow(CareerReferenceError)
      expect(() =>
        createCareerEducation(db, { ...baseInput, stableKey: 'another-key' }),
      ).not.toThrow()
    } finally {
      sqlite.close()
    }
  })
})

describe('stale form conflicts', () => {
  test('update with a wrong expectedRevision throws a conflict error', () => {
    const { sqlite, db } = database()
    try {
      const created = createCareerEducation(db, baseInput)
      expect(() =>
        updateCareerEducation(
          db,
          created.id,
          { ...baseInput, degree: 'MSc' },
          { expectedRevision: 99 },
        ),
      ).toThrow(CareerRevisionConflictError)
      expect(() =>
        updateCareerEducation(
          db,
          created.id,
          { ...baseInput, degree: 'MSc' },
          { expectedRevision: 1 },
        ),
      ).not.toThrow()
      expect(() =>
        updateCareerEducation(
          db,
          created.id,
          { ...baseInput, degree: 'PhD' },
          { expectedRevision: 1 },
        ),
      ).toThrow(/changed since it was loaded/i)
    } finally {
      sqlite.close()
    }
  })
})

describe('retirement', () => {
  test('excludes retired records by default, keeps junctions and restores reversibly', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite)
      const skill = seedSkill(sqlite, 'typescript', 'TypeScript')
      const project = createCareerProject(db, {
        stableKey: 'synthetic-tracker',
        name: 'Synthetic Tracker',
        ownership: 'personal',
        eligibility: 'resume-eligible',
        urls: ['https://example.test/synthetic-tracker'],
        skills: [skill.id],
        directions: ['fullstack'],
      })

      const retired = retireCareerProject(db, project.id)
      expect(retired.changed).toBe(true)
      expect(listCareerProjects(db)).toEqual([])
      const withRetired = listCareerProjects(db, { includeRetired: true })
      expect(withRetired.map((row) => row.id)).toEqual([project.id])
      expect(withRetired[0].skills).toEqual([skill.id])
      expect(withRetired[0].directions).toEqual(['fullstack'])
      expect(
        sqlite
          .query('SELECT count(*) AS count FROM career_project_skills WHERE project_id = ?')
          .get(project.id),
      ).toEqual({ count: 1 })

      const restored = restoreCareerProject(db, project.id)
      expect(restored.changed).toBe(true)
      expect(listCareerProjects(db).map((row) => row.id)).toEqual([project.id])
    } finally {
      sqlite.close()
    }
  })

  test('retiring an achievement keeps its junctions and restore reverses it', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite)
      const experience = sqlite
        .query(
          `INSERT INTO career_experiences (stable_key, company, role, created_at, updated_at)
           VALUES ('northwind', 'Northwind Analytics', 'Senior Developer', 'T', 'T') RETURNING id`,
        )
        .get() as { id: number }
      const skill = seedSkill(sqlite, 'rest-api', 'REST APIs')
      const achievement = createCareerAchievement(db, {
        stableKey: 'reporting-api-delivery',
        experienceId: experience.id,
        claim: 'Delivered a synthetic reporting API.',
        safeToUse: true,
        evidence: ['Synthetic review notes'],
        skills: [skill.id],
        directions: ['fullstack'],
      })
      retireCareerAchievement(db, achievement.id)
      expect(listCareerAchievements(db)).toEqual([])
      const retired = listCareerAchievements(db, { includeRetired: true })[0]
      expect(retired.skills).toEqual([skill.id])
      expect(retired.directions).toEqual(['fullstack'])
      expect(restoreCareerAchievement(db, achievement.id).changed).toBe(true)
      expect(listCareerAchievements(db).map((row) => row.id)).toEqual([achievement.id])
    } finally {
      sqlite.close()
    }
  })

  test('rejects unknown, duplicated and retired references', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite)
      const skill = seedSkill(sqlite, 'sqlite', 'SQLite')
      expect(() =>
        createCareerProject(db, { stableKey: 'p1', name: 'P', directions: ['missing'] }),
      ).toThrow(CareerReferenceError)
      expect(() => createCareerProject(db, { stableKey: 'p1', name: 'P', skills: [9999] })).toThrow(
        CareerReferenceError,
      )
      expect(() =>
        createCareerProject(db, { stableKey: 'p1', name: 'P', skills: [skill.id, skill.id] }),
      ).toThrow(/duplicate/i)
      retireCareerDirection(db, 'fullstack')
      expect(() =>
        createCareerProject(db, { stableKey: 'p1', name: 'P', directions: ['fullstack'] }),
      ).toThrow(/retired/i)
    } finally {
      sqlite.close()
    }
  })
})

describe('base resume versions', () => {
  test('drafts are hashed and immutable, approval selects and supersedes atomically', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite)
      const draft = createBaseResumeDraft(db, {
        directionKey: 'fullstack',
        version: 'v1',
        markdown: approvedBaseResumeMarkdown,
      })
      expect(draft.status).toBe('draft')
      expect(draft.contentHash).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
      expect(selectedApprovedBaseResume(db, 'fullstack')).toBeNull()

      const approval = approveBaseResumeVersion(db, draft.id, { approvedAt: '2026-10-01' })
      expect(approval.changed).toBe(true)
      expect(approval.supersededId).toBeNull()
      const selected = selectedApprovedBaseResume(db, 'fullstack')
      expect(selected?.id).toBe(draft.id)
      expect(selected?.approvedAt).toBe('2026-10-01')

      const second = createBaseResumeDraft(db, {
        directionKey: 'fullstack',
        version: 'v2',
        markdown: draftBaseResumeMarkdown,
      })
      const replacement = approveBaseResumeVersion(db, second.id, { approvedAt: '2026-10-14' })
      expect(replacement.supersededId).toBe(draft.id)
      expect(selectedApprovedBaseResume(db, 'fullstack')?.id).toBe(second.id)

      const previous = readBaseResumeVersion(db, draft.id)
      expect(previous?.status).toBe('superseded')
      expect(previous?.markdown).toBe(approvedBaseResumeMarkdown)
      expect(previous?.contentHash).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
      expect(() => assertBaseResumeImmutable(previous!, { markdown: '# edited' })).toThrow(
        /immutable/i,
      )
      expect(() =>
        assertBaseResumeImmutable(previous!, {
          contentHash: baseResumeTextHash('different'),
        }),
      ).toThrow(/immutable/i)
      expect(() =>
        assertBaseResumeImmutable(previous!, { markdown: previous!.markdown }),
      ).not.toThrow()
    } finally {
      sqlite.close()
    }
  })

  test('rejects empty markdown, duplicate versions and retired directions', () => {
    const { sqlite, db } = database()
    try {
      seedDirection(sqlite)
      const draft = createBaseResumeDraft(db, {
        directionKey: 'fullstack',
        version: 'v1',
        markdown: approvedBaseResumeMarkdown,
      })
      expect(() =>
        createBaseResumeDraft(db, {
          directionKey: 'fullstack',
          version: 'v1',
          markdown: draftBaseResumeMarkdown,
        }),
      ).toThrow(/already exists/i)
      expect(() =>
        createBaseResumeDraft(db, { directionKey: 'fullstack', version: 'v2', markdown: '   ' }),
      ).toThrow(/empty/i)
      expect(() =>
        createBaseResumeDraft(db, {
          directionKey: 'missing',
          version: 'v1',
          markdown: draftBaseResumeMarkdown,
        }),
      ).toThrow(CareerReferenceError)
      retireCareerDirection(db, 'fullstack')
      expect(() =>
        createBaseResumeDraft(db, {
          directionKey: 'fullstack',
          version: 'v3',
          markdown: draftBaseResumeMarkdown,
        }),
      ).toThrow(/retired/i)
      expect(supersedeBaseResumeVersion(db, draft.id).changed).toBe(true)
    } finally {
      sqlite.close()
    }
  })
})

describe('personal skills', () => {
  test('requires an approved catalog skill and retires instead of deleting', () => {
    const { sqlite, db } = database()
    try {
      const approved = seedSkill(sqlite, 'typescript', 'TypeScript')
      const pending = seedSkill(sqlite, 'oauth', 'OAuth', 'pending')
      const merged = seedSkill(sqlite, 'legacy', 'Legacy', 'merged', approved.id)
      const created = createCareerSkill(db, {
        skillKey: 'typescript',
        level: 'advanced',
        resumeEligible: true,
        explanation: 'Used daily.',
        evidence: ['reporting-api-delivery'],
      })
      const list = listCareerSkills(db)
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({
        skillId: approved.id,
        skillKey: 'typescript',
        skillName: 'TypeScript',
        level: 'advanced',
        resumeEligible: true,
      })
      expect(() => createCareerSkill(db, { skillId: pending.id })).toThrow(/not approved/i)
      expect(() => createCareerSkill(db, { skillId: merged.id })).toThrow(/merged/i)
      expect(() => createCareerSkill(db, { skillKey: 'missing' })).toThrow(CareerReferenceError)
      expect(() => createCareerSkill(db, { skillKey: 'typescript' })).toThrow(/already exists/i)
      retireCareerSkill(db, created.id)
      expect(listCareerSkills(db)).toEqual([])
      expect(listCareerSkills(db, { includeRetired: true })).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })
})

describe('directions', () => {
  test('validates target titles and persists bounded rules', () => {
    const { sqlite, db } = database()
    try {
      expect(() =>
        createCareerDirection(db, { key: 'fullstack', label: 'Full-Stack', targetTitles: [] }),
      ).toThrow()
      createCareerDirection(db, {
        key: 'fullstack',
        label: 'Full-Stack Developer',
        targetTitles: ['Full-Stack Developer', 'Senior Software Developer'],
        rules: { maxWords: 750, maxBullets: 30, customRule: 'kept' },
      })
      const direction = readCareerDirection(db, 'fullstack')
      expect(direction?.targetTitles).toEqual(['Full-Stack Developer', 'Senior Software Developer'])
      expect(direction?.rules).toMatchObject({ maxWords: 750, maxBullets: 30, customRule: 'kept' })
      expect(() => updateCareerDirection(db, 'fullstack', { targetTitles: [] })).toThrow()
      expect(updateCareerDirection(db, 'fullstack', {}).changed).toBe(false)
      const renamed = updateCareerDirection(db, 'fullstack', { label: 'Full Stack Engineer' })
      expect(renamed.changed).toBe(true)
      expect(readCareerDirection(db, 'fullstack')?.label).toBe('Full Stack Engineer')
      retireCareerDirection(db, 'fullstack')
      expect(listCareerDirections(db)).toEqual([])
      expect(listCareerDirections(db, { includeRetired: true })).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })
})

describe('requirement-owned mentions', () => {
  function seeded() {
    const { sqlite, db } = database()
    const legacy = seedPopulatedLegacyCatalog(sqlite)
    const analysis = sqlite
      .query('SELECT job_posting_analysis_id AS id FROM job_requirements WHERE id = ?')
      .get(legacy.requirementId) as { id: number }
    const second = sqlite
      .query(
        `INSERT INTO job_requirements (
          job_posting_analysis_id, sequence, requirement_type, importance, basis, statement,
          source_text, created_at, updated_at
        ) VALUES (?, 2, 'skill', 'preferred', 'explicit', 'OAuth 2.0 preferred.', 'OAuth 2.0.', 'T', 'T')
        RETURNING id`,
      )
      .get(analysis.id) as { id: number }
    return {
      sqlite,
      db,
      analysisId: analysis.id,
      secondRequirementId: second.id,
      ...legacy,
    }
  }

  test('pending by default, upserted by requirement and normalized term', () => {
    const { sqlite, db, requirementId } = seeded()
    try {
      const first = upsertPendingMention(db, {
        jobRequirementId: requirementId,
        rawTerm: 'OAuth',
        normalizedTerm: 'OAuth',
        occurrences: [{ source: 'jd', provenance: 'jd-text' }],
      })
      expect(first.mappingState).toBe('pending')
      expect(first.resolvedSkillId).toBeNull()
      expect(first.normalizedTerm).toBe('oauth')
      const again = upsertPendingMention(db, {
        jobRequirementId: requirementId,
        rawTerm: 'OAuth 2.0',
        normalizedTerm: 'oauth',
        occurrences: [{ source: 'jd', provenance: 'jd-text', confidence: 0.6 }],
      })
      expect(again.id).toBe(first.id)
      expect(again.occurrences).toHaveLength(2)
      expect(
        sqlite
          .query(
            "SELECT count(*) AS count FROM job_requirement_skill_mentions WHERE normalized_term = 'oauth'",
          )
          .get(),
      ).toEqual({ count: 1 })
      expect(sqlite.query('SELECT count(*) AS count FROM career_skills').get()).toEqual({
        count: 0,
      })
      expect(() =>
        upsertPendingMention(db, {
          jobRequirementId: requirementId,
          rawTerm: '   ',
          normalizedTerm: 'blank',
          occurrences: [],
        }),
      ).toThrow(CareerReferenceError)
    } finally {
      sqlite.close()
    }
  })

  test('mapping upserts the junction, creates no personal skill, and rejects unusable skills', () => {
    const { sqlite, db, requirementId, typescriptSkillId, pendingSkillId, mergedSkillId } = seeded()
    try {
      const mention = upsertPendingMention(db, {
        jobRequirementId: requirementId,
        rawTerm: 'TypeScript',
        normalizedTerm: 'typescript',
        occurrences: [{ source: 'jd', provenance: 'jd-text', confidence: 0.8 }],
      })
      expect(() => mapMention(db, mention.id, pendingSkillId)).toThrow(/only approved/i)
      expect(() => mapMention(db, mention.id, mergedSkillId)).toThrow(/merged/i)
      expect(() => mapMention(db, mention.id, 9999)).toThrow(CareerReferenceError)

      const mapped = mapMention(db, mention.id, typescriptSkillId)
      expect(mapped.mappingState).toBe('mapped')
      expect(mapped.resolvedSkillId).toBe(typescriptSkillId)
      expect(
        sqlite
          .query(
            'SELECT raw_label, confidence FROM job_requirements_to_skills WHERE job_requirement_id = ? AND skill_id = ?',
          )
          .get(requirementId, typescriptSkillId),
      ).toEqual({ raw_label: 'TypeScript', confidence: 1 })
      expect(sqlite.query('SELECT count(*) AS count FROM career_skills').get()).toEqual({
        count: 0,
      })
      expect(sqlite.query('SELECT count(*) AS count FROM skills').get()).toEqual({ count: 3 })
      expect(sqlite.query('SELECT count(*) AS count FROM skill_aliases').get()).toEqual({
        count: 1,
      })

      const skipped = skipMention(db, mention.id)
      expect(skipped.mappingState).toBe('skipped')
      expect(
        sqlite
          .query(
            'SELECT count(*) AS count FROM job_requirements_to_skills WHERE job_requirement_id = ? AND skill_id = ?',
          )
          .get(requirementId, typescriptSkillId),
      ).toEqual({ count: 0 })

      mapMention(db, mention.id, typescriptSkillId)
      const reset = resetMention(db, mention.id)
      expect(reset.mappingState).toBe('pending')
      expect(reset.resolvedSkillId).toBeNull()
      expect(
        sqlite
          .query(
            'SELECT count(*) AS count FROM job_requirements_to_skills WHERE job_requirement_id = ? AND skill_id = ?',
          )
          .get(requirementId, typescriptSkillId),
      ).toEqual({ count: 0 })
    } finally {
      sqlite.close()
    }
  })

  test('groups one row per skill, keeps distinct sources and reports readiness', () => {
    const { sqlite, db, analysisId, requirementId, secondRequirementId, typescriptSkillId } =
      seeded()
    try {
      const first = upsertPendingMention(db, {
        jobRequirementId: requirementId,
        rawTerm: 'TypeScript',
        normalizedTerm: 'typescript',
        occurrences: [{ source: 'jd', provenance: 'jd-text' }],
      })
      const second = upsertPendingMention(db, {
        jobRequirementId: secondRequirementId,
        rawTerm: 'OAuth',
        normalizedTerm: 'oauth',
        occurrences: [{ source: 'jd', provenance: 'jd-text' }],
      })
      mapMention(db, first.id, typescriptSkillId)
      mapMention(db, second.id, typescriptSkillId)

      const groups = listCanonicalSkillGroups(db, analysisId)
      expect(groups).toHaveLength(1)
      expect(groups[0]).toMatchObject({
        skillId: typescriptSkillId,
        skillKey: 'typescript',
        skillName: 'TypeScript',
        importance: 'required',
      })
      expect(groups[0].sources).toHaveLength(2)
      expect(groups[0].sources.map((source) => source.requirementStatement)).toEqual([
        'TypeScript experience required.',
        'OAuth 2.0 preferred.',
      ])
      expect(groups[0].sources.map((source) => source.requirementId)).toEqual([
        requirementId,
        secondRequirementId,
      ])

      expect(countPendingMentions(db, analysisId)).toBe(0)
      const open = upsertPendingMention(db, {
        jobRequirementId: secondRequirementId,
        rawTerm: 'Kubernetes',
        normalizedTerm: 'kubernetes',
        occurrences: [{ source: 'jd', provenance: 'jd-text' }],
      })
      expect(countPendingMentions(db, analysisId)).toBe(1)
      const mentions = listAnalysisMentions(db, analysisId)
      expect(mentions.map((mention) => mention.mappingState).sort()).toEqual([
        'mapped',
        'mapped',
        'pending',
      ])
      expect(mentions.find((mention) => mention.id === open.id)?.requirementSequence).toBe(2)
      expect(listRequirementMentions(db, secondRequirementId)).toHaveLength(2)
    } finally {
      sqlite.close()
    }
  })
})

describe('candidate and preferences singletons', () => {
  test('round trip known and unknown extension keys', () => {
    const { sqlite, db } = database()
    try {
      expect(readCareerCandidate(db)).toBeNull()
      const saved = saveCareerCandidate(db, {
        fullName: 'Jordan Rivera',
        email: 'jordan.rivera@example.test',
        authorization: {
          workAuthorization: 'Synthetic citizen of Exampleland',
          requiresSponsorship: false,
          notes: 'Synthetic authorization fixture.',
          syntheticExtension: { nested: [1, 2] },
        },
        careerBreak: { hasBreak: true, startDate: '2024-02', datePrecision: 'month' },
        truthfulness: { neverClaimUnexperiencedSkill: true },
      })
      expect(saved).toEqual({ changed: true, revision: 1 })
      const candidate = readCareerCandidate(db)
      expect(candidate?.fullName).toBe('Jordan Rivera')
      expect(candidate?.authorization?.syntheticExtension).toEqual({ nested: [1, 2] })
      expect(candidate?.careerBreak?.datePrecision).toBe('month')
      expect(
        saveCareerCandidate(db, {
          fullName: 'Jordan Rivera',
          email: 'jordan.rivera@example.test',
          authorization: candidate?.authorization,
          careerBreak: candidate?.careerBreak,
          truthfulness: candidate?.truthfulness,
        }),
      ).toEqual({ changed: false, revision: 1 })

      const preferences = saveCareerPreferences(db, {
        locations: ['Edmonton, AB', 'Remote (Canada)'],
        workModes: ['remote', 'hybrid'],
        availability: 'Two weeks notice',
        compensation: { currency: 'CAD', minimum: 120000, syntheticRange: true },
      })
      // Both halves share the one career_profile revision, so this bump follows
      // the candidate save above.
      expect(preferences).toEqual({ changed: true, revision: 2 })
      const stored = readCareerPreferences(db)
      expect(stored?.locations).toEqual(['Edmonton, AB', 'Remote (Canada)'])
      expect(stored?.compensation).toMatchObject({
        currency: 'CAD',
        minimum: 120000,
        syntheticRange: true,
      })
      expect(
        saveCareerPreferences(db, {
          locations: stored?.locations,
          workModes: stored?.workModes,
          availability: stored?.availability,
          compensation: stored?.compensation,
        }),
      ).toEqual({ changed: false, revision: 2 })
    } finally {
      sqlite.close()
    }
  })

  test('malformed JSON raises a clear error naming the column', () => {
    const { sqlite, db } = database()
    try {
      saveCareerCandidate(db, { fullName: 'Jordan Rivera', authorization: { notes: 'ok' } })
      sqlite.query("UPDATE career_profile SET authorization_json = '{not json' WHERE id = 1").run()
      expect(() => readCareerCandidate(db)).toThrow(/career_profile\.authorization_json/)
      sqlite.query('UPDATE career_profile SET authorization_json = NULL WHERE id = 1').run()
      expect(readCareerCandidate(db)?.authorization).toBeNull()
    } finally {
      sqlite.close()
    }
  })
})

describe('startup readiness', () => {
  test('assertDatabaseReady accepts a fully migrated database', () => {
    const sqlite = migratedDatabase()
    try {
      expect(() => assertDatabaseReady(sqlite)).not.toThrow()
    } finally {
      sqlite.close()
    }
  })
})
