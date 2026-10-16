import { expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { persistRequirementMentions } from '../../src/db/job-analysis'
import * as schema from '../../src/db/schema'
import { deleteCatalogSkill } from '../../src/db/skill-deletion'
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
      rawText: 'React (TypeScript / )',
      contentHash: 'source-hash',
      capturedAt: stamp.createdAt,
    })
    .returning()
    .get()
  const jobRun = db
    .insert(schema.jobPostingAnalyses)
    .values({
      jobPostingId: posting.id,
      status: 'Completed',
      resultJson: '{"history":"original job output"}',
      completedAt: stamp.createdAt,
      ...stamp,
    })
    .returning()
    .get()
  const requirement = db
    .insert(schema.jobRequirements)
    .values({
      jobPostingAnalysisId: jobRun.id,
      sequence: 1,
      requirementType: 'skill',
      importance: 'required',
      basis: 'explicit',
      statement: 'React (TypeScript / )',
      sourceText: posting.rawText,
      ...stamp,
    })
    .returning()
    .get()
  const junk = db
    .insert(schema.skills)
    .values({ name: ')', key: 'term-c9216a4bb2623d40', origin: 'job-parser', ...stamp })
    .returning()
    .get()
  const mention = db
    .insert(schema.jobRequirementSkillMentions)
    .values({
      jobRequirementId: requirement.id,
      rawTerm: ')',
      normalizedTerm: ')',
      mappingState: 'mapped',
      resolvedSkillId: junk.id,
      occurrencesJson:
        '[{"source":"job-analysis","provenance":"job-parser","context":"React (TypeScript / )","confidence":0.8}]',
      ...stamp,
    })
    .returning()
    .get()
  const candidate = db
    .insert(schema.applicationAnalysisRuns)
    .values({
      jobPostingAnalysisId: jobRun.id,
      status: 'Completed',
      queueJobId: crypto.randomUUID(),
      inputSnapshotJson: '{"history":"frozen input"}',
      resultJson: '{"history":"original candidate output"}',
      completedAt: stamp.createdAt,
      ...stamp,
    })
    .returning()
    .get()
  const decision = db
    .insert(schema.analysisRunDecisions)
    .values({
      applicationAnalysisRunId: candidate.id,
      skillId: junk.id,
      decision: 'include',
      reason: 'Original user reason',
      basisHash: 'old-basis',
      ...stamp,
    })
    .returning()
    .get()
  db.insert(schema.skillAliases)
    .values({
      skillId: junk.id,
      alias: 'bad alias',
      normalizedAlias: 'bad alias',
      createdAt: stamp.createdAt,
    })
    .run()
  return {
    sqlite,
    db,
    stamp,
    company,
    application,
    posting,
    jobRun,
    requirement,
    junk,
    mention,
    candidate,
    decision,
  }
}

test('deleting a job-only skill skips source mentions and removes decisions without deleting history', () => {
  const f = fixture()
  try {
    const keep = f.db
      .insert(schema.skills)
      .values({ name: 'React', key: 'react', ...f.stamp })
      .returning()
      .get()
    const keptDecision = f.db
      .insert(schema.analysisRunDecisions)
      .values({
        applicationAnalysisRunId: f.candidate.id,
        skillId: keep.id,
        decision: 'include',
        reason: 'Keep this reason',
        previousDecisionId: f.decision.id,
        ...f.stamp,
      })
      .returning()
      .get()
    const generation = f.db
      .insert(schema.generationRuns)
      .values({
        applicationAnalysisRunId: f.candidate.id,
        queueJobId: crypto.randomUUID(),
        status: 'Completed',
        frozenInputJson: '{"history":"document input"}',
        resumeMarkdown: 'Previously generated resume',
        completedAt: f.stamp.createdAt,
        ...f.stamp,
      })
      .returning()
      .get()
    const artifact = f.db
      .insert(schema.generatedArtifacts)
      .values({
        generationRunId: generation.id,
        type: 'resume',
        fileName: 'resume.docx',
        filePath: '/synthetic/resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        googleDriveUrl: 'https://drive.google.com/file/d/synthetic/view',
        createdAt: f.stamp.createdAt,
      })
      .returning()
      .get()
    deleteCatalogSkill(f.junk.id, f.db)
    expect(
      f.db.select().from(schema.skills).where(eq(schema.skills.id, f.junk.id)).get(),
    ).toBeUndefined()
    expect(f.db.select().from(schema.skillAliases).all()).toEqual([])
    const mention = f.db
      .select()
      .from(schema.jobRequirementSkillMentions)
      .where(eq(schema.jobRequirementSkillMentions.id, f.mention.id))
      .get()!
    expect(mention).toMatchObject({
      rawTerm: ')',
      normalizedTerm: ')',
      mappingState: 'skipped',
      resolvedSkillId: null,
      revision: f.mention.revision + 1,
      occurrencesJson: f.mention.occurrencesJson,
    })
    expect(f.db.select().from(schema.jobRequirementsToSkills).all()).toEqual([])
    expect(
      f.db
        .select()
        .from(schema.analysisRunDecisions)
        .where(eq(schema.analysisRunDecisions.skillId, f.junk.id))
        .all(),
    ).toEqual([])
    expect(
      f.db
        .select()
        .from(schema.analysisRunDecisions)
        .where(eq(schema.analysisRunDecisions.id, keptDecision.id))
        .get(),
    ).toMatchObject({ reason: 'Keep this reason', previousDecisionId: null })
    expect(f.db.select().from(schema.jobApplications).get()).toEqual(f.application)
    expect(f.db.select().from(schema.jobPostings).get()).toEqual(f.posting)
    expect(f.db.select().from(schema.jobPostingAnalyses).get()).toEqual(f.jobRun)
    expect(f.db.select().from(schema.applicationAnalysisRuns).get()).toEqual(f.candidate)
    expect(f.db.select().from(schema.generationRuns).get()).toEqual(generation)
    expect(f.db.select().from(schema.generatedArtifacts).get()).toEqual(artifact)
    expect(f.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    f.sqlite.close()
  }
})

test('personal career references roll back all deletion cleanup', () => {
  const f = fixture()
  try {
    f.db
      .insert(schema.careerSkills)
      .values({ skillId: f.junk.id, explanation: 'Personal fact must survive', ...f.stamp })
      .run()
    expect(() => deleteCatalogSkill(f.junk.id, f.db)).toThrow()
    expect(f.db.select().from(schema.skills).get()).toEqual(f.junk)
    expect(f.db.select().from(schema.jobRequirementSkillMentions).get()).toEqual(f.mention)
    expect(f.db.select().from(schema.analysisRunDecisions).get()).toEqual(f.decision)
    expect(f.db.select().from(schema.skillAliases).all()).toHaveLength(1)
    expect(f.db.select().from(schema.careerSkills).get()?.explanation).toBe(
      'Personal fact must survive',
    )
  } finally {
    f.sqlite.close()
  }
})

test('incoming merge redirects also roll back the entire deletion', () => {
  const f = fixture()
  try {
    f.db
      .insert(schema.skills)
      .values({
        key: 'old-key',
        name: 'Old name',
        reviewStatus: 'merged',
        mergedIntoSkillId: f.junk.id,
        ...f.stamp,
      })
      .run()
    expect(() => deleteCatalogSkill(f.junk.id, f.db)).toThrow()
    expect(f.db.select().from(schema.jobRequirementSkillMentions).get()).toEqual(f.mention)
    expect(f.db.select().from(schema.analysisRunDecisions).get()).toEqual(f.decision)
    expect(f.db.select().from(schema.skills).all()).toHaveLength(2)
  } finally {
    f.sqlite.close()
  }
})

test('remapping the same stored source does not recreate a deleted and skipped skill', () => {
  const f = fixture()
  try {
    f.db
      .update(schema.skills)
      .set({ key: 'example-skill', name: 'Example skill' })
      .where(eq(schema.skills.id, f.junk.id))
      .run()
    f.db
      .update(schema.jobRequirementSkillMentions)
      .set({ rawTerm: 'Example skill', normalizedTerm: 'example skill' })
      .where(eq(schema.jobRequirementSkillMentions.id, f.mention.id))
      .run()
    deleteCatalogSkill(f.junk.id, f.db)
    persistRequirementMentions(
      f.db,
      f.requirement.id,
      [
        {
          rawTerm: 'Example skill',
          normalizedTerm: 'example skill',
          occurrences: [],
          state: 'pending',
        },
      ],
      f.stamp.updatedAt,
    )
    expect(f.db.select().from(schema.skills).all()).toEqual([])
    expect(f.db.select().from(schema.jobRequirementSkillMentions).get()).toMatchObject({
      rawTerm: 'Example skill',
      mappingState: 'skipped',
      resolvedSkillId: null,
    })
  } finally {
    f.sqlite.close()
  }
})

test('the persistence boundary also rejects punctuation when the resolver is bypassed', () => {
  const f = fixture()
  try {
    deleteCatalogSkill(f.junk.id, f.db)
    const requirement = f.db
      .insert(schema.jobRequirements)
      .values({
        jobPostingAnalysisId: f.jobRun.id,
        sequence: 2,
        requirementType: 'skill',
        importance: 'required',
        basis: 'explicit',
        statement: 'Source containing punctuation',
        sourceText: ')',
        ...f.stamp,
      })
      .returning()
      .get()
    persistRequirementMentions(
      f.db,
      requirement.id,
      [{ rawTerm: ')', normalizedTerm: ')', occurrences: [], state: 'pending' }],
      f.stamp.updatedAt,
    )
    expect(f.db.select().from(schema.skills).all()).toEqual([])
    expect(
      f.db
        .select()
        .from(schema.jobRequirementSkillMentions)
        .where(eq(schema.jobRequirementSkillMentions.jobRequirementId, requirement.id))
        .all(),
    ).toEqual([])
    expect(
      f.db
        .select()
        .from(schema.jobRequirementSkillMentions)
        .where(eq(schema.jobRequirementSkillMentions.id, f.mention.id))
        .get()?.rawTerm,
    ).toBe(')')
  } finally {
    f.sqlite.close()
  }
})
