import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { persistJobRequirements, persistRequirementMentions } from '../../src/db/job-analysis'
import * as schema from '../../src/db/schema'
import { insertSkill } from '../../src/db/skill-queries'
import { addSkillAlias, mergeSkills } from '../../src/db/skill-service'
import type { ResolvedMention } from '../../src/lib/skills/resolver'
import { migratedDatabase } from '../support/sqlite'

function fixture() {
  const sqlite = migratedDatabase()
  const db = drizzle({ client: sqlite, schema })
  const stamp = { createdAt: '2026-10-16', updatedAt: '2026-10-16' }
  const company = db
    .insert(schema.companies)
    .values({ name: 'Example', ...stamp })
    .returning()
    .get()
  const application = db
    .insert(schema.jobApplications)
    .values({ companyId: company.id, jobTitle: 'Engineer', ...stamp })
    .returning()
    .get()
  const posting = db
    .insert(schema.jobPostings)
    .values({
      jobApplicationId: application.id,
      rawText: 'accessibilité Web',
      contentHash: 'synthetic',
      capturedAt: stamp.createdAt,
    })
    .returning()
    .get()
  const run = db
    .insert(schema.jobPostingAnalyses)
    .values({ jobPostingId: posting.id, ...stamp })
    .returning()
    .get()
  const requirement = db
    .insert(schema.jobRequirements)
    .values({
      jobPostingAnalysisId: run.id,
      sequence: 1,
      requirementType: 'skill',
      importance: 'required',
      basis: 'explicit',
      statement: 'Web accessibility',
      sourceText: posting.rawText,
      ...stamp,
    })
    .returning()
    .get()
  const persist = (mention: ResolvedMention) =>
    db.transaction((tx) =>
      persistRequirementMentions(tx, requirement.id, [mention], stamp.updatedAt),
    )
  return { sqlite, db, stamp, run, requirement, persist }
}

describe('analysis completion reconciles frozen skill keys with live merges', () => {
  test('a frozen catalog completed after a hard merge reuses the target and preserves source evidence', () => {
    const f = fixture()
    try {
      const source = insertSkill(f.db, {
        key: 'accessibility (a11y)',
        name: 'Accessibility (a11y)',
        reviewStatus: 'approved',
      })
      const target = insertSkill(f.db, {
        key: 'accessibility',
        name: 'Web Accessibility / WCAG',
        reviewStatus: 'approved',
      })
      addSkillAlias(source.id, 'accessibilité Web', 'manual', f.db)
      addSkillAlias(source.id, 'accessibilit-web', 'manual', f.db)
      const frozenCatalog = [
        { key: source.key, name: source.name, category: null, aliases: ['accessibilité Web'] },
      ]
      const frozen = JSON.stringify({ catalog: frozenCatalog })
      f.db
        .update(schema.jobPostingAnalyses)
        .set({ frozenInputJson: frozen })
        .where(eq(schema.jobPostingAnalyses.id, f.run.id))
        .run()
      mergeSkills(source.id, target.id, f.db)

      f.db.transaction((tx) =>
        persistJobRequirements(
          tx,
          f.run.id,
          [
            {
              type: 'skill',
              importance: 'required',
              basis: 'explicit',
              statement: 'Provide web accessibility',
              sourceText: 'accessibilité Web',
              inferenceRationale: null,
              terms: [
                {
                  term: 'accessibilité Web',
                  key: source.key,
                  confidence: 0.9,
                  sourceText: 'accessibilité Web',
                },
              ],
            },
          ],
          f.stamp.updatedAt,
          frozenCatalog,
        ),
      )

      expect(f.db.select().from(schema.skills).all()).toEqual([
        expect.objectContaining({ id: target.id, key: 'accessibility', reviewStatus: 'approved' }),
      ])
      expect(f.db.select().from(schema.jobRequirementSkillMentions).all()).toEqual([
        expect.objectContaining({
          rawTerm: 'accessibilité Web',
          normalizedTerm: 'accessibilité web',
          mappingState: 'mapped',
          resolvedSkillId: target.id,
        }),
      ])
      expect(
        JSON.parse(
          f.db.select().from(schema.jobRequirementSkillMentions).get()!.occurrencesJson,
        )[0],
      ).toMatchObject({ context: 'accessibilité Web', confidence: 0.9 })
      expect(f.db.select().from(schema.jobPostingAnalyses).get()?.frozenInputJson).toBe(frozen)
      expect(f.db.select().from(schema.careerSkills).all()).toEqual([])
      expect(f.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      f.sqlite.close()
    }
  })

  test('a deleted frozen key resolves through its retained alias even when the raw label differs', () => {
    const f = fixture()
    try {
      const source = insertSkill(f.db, { key: 'old-standard', name: 'Old Standard' })
      const target = insertSkill(f.db, { key: 'current-standard', name: 'Current Standard' })
      mergeSkills(source.id, target.id, f.db)
      f.persist({
        rawTerm: 'Previously verified wording',
        normalizedTerm: 'previously verified wording',
        skillKey: source.key,
        state: 'mapped',
        occurrences: [],
      })
      expect(f.db.select().from(schema.skills).all()).toHaveLength(1)
      expect(f.db.select().from(schema.jobRequirementSkillMentions).get()?.resolvedSkillId).toBe(
        target.id,
      )
    } finally {
      f.sqlite.close()
    }
  })

  test.each(['alias', 'name', 'key'] as const)(
    'a missing frozen identity still falls back to the raw term %s',
    (match) => {
      const f = fixture()
      try {
        const target = insertSkill(f.db, {
          key: match === 'key' ? 'raw term' : 'current-standard',
          name: match === 'name' ? 'Raw Term' : 'Current Standard',
        })
        if (match === 'alias') addSkillAlias(target.id, 'Raw Term', 'manual', f.db)
        f.persist({
          rawTerm: 'Raw Term',
          normalizedTerm: 'raw term',
          skillKey: 'missing-frozen-key',
          state: 'mapped',
          occurrences: [],
        })
        expect(f.db.select().from(schema.skills).all()).toHaveLength(1)
        expect(f.db.select().from(schema.jobRequirementSkillMentions).get()?.resolvedSkillId).toBe(
          target.id,
        )
      } finally {
        f.sqlite.close()
      }
    },
  )

  test('genuinely unknown terms still create a single pending catalog record without personal facts', () => {
    const f = fixture()
    try {
      const mention: ResolvedMention = {
        rawTerm: 'Unknown Tool',
        normalizedTerm: 'unknown tool',
        skillKey: 'unavailable-frozen-key',
        state: 'mapped',
        occurrences: [],
      }
      f.persist(mention)
      f.persist(mention)
      expect(f.db.select().from(schema.skills).all()).toEqual([
        expect.objectContaining({
          name: 'Unknown Tool',
          key: 'unknown-tool',
          origin: 'job-parser',
          reviewStatus: 'pending',
        }),
      ])
      expect(f.db.select().from(schema.skillAliases).all()).toEqual([])
      expect(f.db.select().from(schema.careerSkills).all()).toEqual([])
    } finally {
      f.sqlite.close()
    }
  })

  test('an explicit skipped mention remains skipped despite a frozen key or live alias', () => {
    const f = fixture()
    try {
      const target = insertSkill(f.db, { key: 'current-standard', name: 'Current Standard' })
      addSkillAlias(target.id, 'Raw Term', 'manual', f.db)
      f.db
        .insert(schema.jobRequirementSkillMentions)
        .values({
          jobRequirementId: f.requirement.id,
          rawTerm: 'Raw Term',
          normalizedTerm: 'raw term',
          mappingState: 'skipped',
          ...f.stamp,
        })
        .run()
      f.persist({
        rawTerm: 'Raw Term',
        normalizedTerm: 'raw term',
        skillKey: 'missing-frozen-key',
        state: 'mapped',
        occurrences: [],
      })
      expect(f.db.select().from(schema.jobRequirementSkillMentions).get()).toMatchObject({
        mappingState: 'skipped',
        resolvedSkillId: null,
      })
      expect(f.db.select().from(schema.skills).all()).toHaveLength(1)
    } finally {
      f.sqlite.close()
    }
  })
})
