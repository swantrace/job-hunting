import { createHash } from 'node:crypto'
import { and, eq, inArray, like, or, type SQL, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { jobAnalysisSchemaVersion } from '../ai/schemas/job-analysis'
import {
  type ApplicationSort,
  matchLevels,
  priorities,
  statuses,
} from '../lib/applications/constants'
import { todayISO } from '../lib/date'
import { runStatuses } from '../lib/generation/constants'
import {
  applicationKey,
  companyKey,
  contactKey,
  detectImportConflicts,
  type ImportPayload,
  key,
  nullableText,
  skillKey,
  textValue,
  validateImportSnapshots,
} from '../lib/import'
import { jobAnalysisInputFromContent } from '../lib/job-analysis-input'
import {
  persistedRequirementBases,
  requirementImportances,
  requirementTypes,
} from '../lib/job-requirements/constants'
import {
  type SkillOrigin,
  type SkillReviewStatus,
  skillDecisions,
  skillImportances,
  skillMatchResults,
} from '../lib/skills/constants'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import { hasSkillCategory, type SkillCategory } from '../lib/skills/taxonomy'
import { advanceStatus } from '../lib/transitions'
import {
  type applicationSchema,
  type filterSchema,
  type quickCollectSchema,
  statusesFromFilters,
} from '../lib/validation'
import { db } from './client'
import { persistCompletedJobAnalysis } from './job-analysis-runs'
import {
  analysisRunDecisions,
  applicationAnalysisRuns,
  companies,
  contacts,
  documentReviews,
  followUps,
  generationRunResults,
  generationRuns,
  interviews,
  type JobApplication,
  jobApplications,
  jobApplicationsToContacts,
  jobApplicationsToSkills,
  jobPostingAnalyses,
  jobPostings,
  jobRequirements,
  jobRequirementsToSkills,
  skillAliases,
  skills,
} from './schema'
import {
  type DbExecutor,
  getOrCreateSkill,
  insertSkill,
  persistSkillRequirements,
  reconcileSkillNames,
} from './skill-queries'

export type Filters = z.infer<typeof filterSchema>
export type JobCardData = JobApplication & {
  companyName: string
  companyWebsite: string | null
  skills: string[]
  contacts?: (typeof contacts.$inferSelect)[]
  jobPosting?: typeof jobPostings.$inferSelect
  jobPostingAnalysis?: typeof jobPostingAnalyses.$inferSelect
}

const cleanSkills = (value?: string | null) => [
  ...new Set(
    (value ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  ),
]

function controlledValue<const Values extends readonly string[], const Fallback>(
  values: Values,
  value: unknown,
  fallback: Fallback,
): Values[number] | Fallback {
  const normalized = textValue(value)
  return (values as readonly string[]).includes(normalized)
    ? (normalized as Values[number])
    : fallback
}

function getOrCreateCompany(tx: DbExecutor, name: string, date: string) {
  let company = tx
    .select()
    .from(companies)
    .where(sql`lower(${companies.name}) = lower(${name})`)
    .get()
  if (!company) {
    tx.insert(companies).values({ name, createdAt: date }).onConflictDoNothing().run()
    company = tx
      .select()
      .from(companies)
      .where(sql`lower(${companies.name}) = lower(${name})`)
      .get()
  }
  if (!company) throw new Error('Unable to resolve company')
  return company
}

function replaceSkills(tx: DbExecutor, jobId: number, names: string[]) {
  reconcileSkillNames(tx, jobId, names)
}

export function createApplication(input: z.infer<typeof quickCollectSchema>) {
  const date = todayISO()
  return db.transaction((tx) => {
    const company = getOrCreateCompany(tx, input.companyName, date)
    const result = tx
      .insert(jobApplications)
      .values({
        companyId: company.id,
        jobTitle: input.jobTitle,
        direction: input.direction,
        location: input.location,
        url: input.url,
        postedDate: input.postedDate,
        priority: 'B',
        applicationSource: input.applicationSource,
        salary: input.salary,
        status: 'Saved',
        createdAt: date,
        updatedAt: date,
      })
      .returning({ id: jobApplications.id })
      .get()
    if (input.skillRequirements?.length) {
      persistSkillRequirements(tx, result.id, input.skillRequirements)
    } else {
      replaceSkills(tx, result.id, cleanSkills(input.skills))
    }
    const rawText = input.jobPostText?.trim()
    if (rawText) {
      const contentHash = createHash('sha256').update(rawText).digest('hex')
      const posting = tx
        .insert(jobPostings)
        .values({
          jobApplicationId: result.id,
          rawText,
          capturedAt: date,
          contentHash,
          parsedAt: input.analysisRequirements || input.jobAnalysis ? date : null,
          parserModel: input.parserModel,
          parserPromptVersion: input.parserPromptVersion,
        })
        .returning({ id: jobPostings.id })
        .get()
      if (input.parserPromptVersion || input.jobAnalysis) {
        const analysis = input.jobAnalysis
        const inputIdentity = jobAnalysisInputFromContent(contentHash)
        persistCompletedJobAnalysis(tx, {
          jobPostingId: posting.id,
          inputHash: inputIdentity.inputHash,
          frozenInputJson: JSON.stringify(inputIdentity.snapshot),
          model: input.parserModel,
          promptVersion: input.parserPromptVersion,
          requirements: input.analysisRequirements,
          responsibilities: input.analysisResponsibilities,
          painPoints: input.analysisPainPoints,
          culture: input.analysisCulture,
          redFlags: input.analysisRedFlags,
          successMetrics: input.analysisSuccessMetrics,
          benefits: input.analysisBenefits,
          notes: input.analysisNotes,
          summary: analysis ? JSON.stringify(analysis.summary) : null,
          roleType: analysis?.classification.roleType ?? null,
          advertisedSeniority: analysis?.classification.advertisedSeniority ?? null,
          practicalSeniority: analysis?.classification.practicalSeniority ?? null,
          classificationRationale: analysis?.classification.rationale ?? null,
          functionalEmphasisJson: analysis
            ? JSON.stringify(analysis.classification.functionalEmphasis)
            : null,
          interviewQuestionsJson: analysis ? JSON.stringify(analysis.interviewQuestions) : null,
          schemaVersion: analysis ? jobAnalysisSchemaVersion : null,
          requirementsRows: analysis
            ? analysis.requirements.map((requirement) => ({
                type: requirement.type,
                importance: requirement.importance,
                basis: requirement.basis,
                statement: requirement.statement,
                sourceText: requirement.sourceText,
                inferenceRationale: requirement.inferenceRationale,
              }))
            : [],
          date,
        })
      }
    }
    return result.id
  })
}

export function updateApplication(id: number, input: z.infer<typeof applicationSchema>) {
  const date = todayISO()
  return db.transaction((tx) => {
    const existing = tx.select().from(jobApplications).where(eq(jobApplications.id, id)).get()
    if (!existing) return false
    const company = getOrCreateCompany(tx, input.companyName, date)
    tx.update(jobApplications)
      .set({
        companyId: company.id,
        jobTitle: input.jobTitle,
        direction: input.direction,
        location: input.location,
        url: input.url,
        postedDate: input.postedDate,
        priority: input.priority,
        appliedDate: input.appliedDate ?? date,
        resumeVersion: input.resumeVersion,
        matchLevel: input.matchLevel,
        applicationSource: input.applicationSource,
        salary: input.salary,
        notes: input.notes,
        status: existing.status,
        updatedAt: date,
      })
      .where(eq(jobApplications.id, id))
      .run()
    replaceSkills(tx, id, cleanSkills(input.skills))
    return true
  })
}

export function listApplications(filters: Filters): JobCardData[] {
  const conditions = []
  const statusesToShow = statusesFromFilters(filters)
  conditions.push(inArray(jobApplications.status, statusesToShow))
  if (filters.today) conditions.push(eq(jobApplications.applyTodayTargetDate, todayISO()))
  if (filters.priority) conditions.push(eq(jobApplications.priority, filters.priority))
  if (filters.q) {
    const escaped = filters.q.replace(/[\\%_]/g, '\\$&')
    const pattern = `%${escaped}%`
    conditions.push(or(like(jobApplications.jobTitle, pattern), like(companies.name, pattern))!)
  }
  const orderMap = {
    updated_desc: sql`${jobApplications.updatedAt} desc, ${jobApplications.id} desc`,
    posted_desc: sql`${jobApplications.postedDate} desc, ${jobApplications.id} desc`,
    posted_asc: sql`${jobApplications.postedDate} asc, ${jobApplications.id} desc`,
    company_asc: sql`${companies.name} collate nocase asc, ${jobApplications.id} desc`,
    company_desc: sql`${companies.name} collate nocase desc, ${jobApplications.id} desc`,
    priority_asc: sql`${jobApplications.priority} asc, ${jobApplications.id} desc`,
    priority_desc: sql`${jobApplications.priority} desc, ${jobApplications.id} desc`,
    target_asc: sql`${jobApplications.applyTodayTargetDate} is null, ${jobApplications.applyTodayTargetDate} asc, ${jobApplications.id} desc`,
    applied_desc: sql`${jobApplications.appliedDate} is null, ${jobApplications.appliedDate} desc, ${jobApplications.id} desc`,
    applied_asc: sql`${jobApplications.appliedDate} is null, ${jobApplications.appliedDate} asc, ${jobApplications.id} desc`,
  } as const satisfies Record<ApplicationSort, SQL>
  const rows = db
    .select({
      job: jobApplications,
      companyName: companies.name,
      companyWebsite: companies.website,
    })
    .from(jobApplications)
    .innerJoin(companies, eq(jobApplications.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(orderMap[filters.sort])
    .all()
  if (!rows.length) return []
  const skillRows = db
    .select({ jobId: jobApplicationsToSkills.jobApplicationId, name: skills.name })
    .from(jobApplicationsToSkills)
    .innerJoin(skills, eq(jobApplicationsToSkills.skillId, skills.id))
    .where(
      inArray(
        jobApplicationsToSkills.jobApplicationId,
        rows.map((row) => row.job.id),
      ),
    )
    .all()
  return rows.map((row) => ({
    ...row.job,
    companyName: row.companyName,
    companyWebsite: row.companyWebsite,
    skills: skillRows.filter((skill) => skill.jobId === row.job.id).map((skill) => skill.name),
  }))
}

export function getApplication(id: number): JobCardData | null {
  const row = db
    .select({
      job: jobApplications,
      companyName: companies.name,
      companyWebsite: companies.website,
    })
    .from(jobApplications)
    .innerJoin(companies, eq(jobApplications.companyId, companies.id))
    .where(eq(jobApplications.id, id))
    .get()
  if (!row) return null
  const jobSkills = db
    .select({ name: skills.name })
    .from(jobApplicationsToSkills)
    .innerJoin(skills, eq(jobApplicationsToSkills.skillId, skills.id))
    .where(eq(jobApplicationsToSkills.jobApplicationId, id))
    .all()
    .map((skill) => skill.name)
  const jobPosting = db.select().from(jobPostings).where(eq(jobPostings.jobApplicationId, id)).get()
  const jobPostingAnalysis = jobPosting
    ? db
        .select()
        .from(jobPostingAnalyses)
        .where(eq(jobPostingAnalyses.jobPostingId, jobPosting.id))
        .get()
    : undefined
  const jobContacts = db
    .select({ contact: contacts })
    .from(jobApplicationsToContacts)
    .innerJoin(contacts, eq(jobApplicationsToContacts.contactId, contacts.id))
    .where(eq(jobApplicationsToContacts.jobApplicationId, id))
    .all()
    .map((row) => row.contact)
  return {
    ...row.job,
    companyName: row.companyName,
    companyWebsite: row.companyWebsite,
    skills: jobSkills,
    contacts: jobContacts,
    jobPosting,
    jobPostingAnalysis,
  }
}

export function addContactToApplication(
  applicationId: number,
  input: { name: string; email?: string | null; linkedinUrl?: string | null },
) {
  return db.transaction((tx) => {
    const application = tx
      .select({ companyId: jobApplications.companyId })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId))
      .get()
    if (!application) return false

    let contact = tx
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.companyId, application.companyId),
          sql`lower(${contacts.name}) = lower(${input.name})`,
        ),
      )
      .get()
    if (!contact) {
      contact = tx
        .insert(contacts)
        .values({
          companyId: application.companyId,
          name: input.name,
          email: input.email ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
        })
        .returning()
        .get()
    }
    tx.insert(jobApplicationsToContacts)
      .values({ jobApplicationId: applicationId, contactId: contact.id })
      .onConflictDoNothing()
      .run()
    return true
  })
}

export function listManagementData() {
  return {
    skills: db.select().from(skills).orderBy(sql`lower(${skills.name})`).all(),
    companies: db.select().from(companies).orderBy(sql`lower(${companies.name})`).all(),
    contacts: db
      .select({ contact: contacts, companyName: companies.name })
      .from(contacts)
      .innerJoin(companies, eq(contacts.companyId, companies.id))
      .orderBy(sql`lower(${contacts.name})`)
      .all(),
  }
}

export function exportData() {
  const companyRows = db.select().from(companies).all()
  const companyById = new Map(companyRows.map((company) => [company.id, company.name]))
  const skillRows = db.select().from(skills).all()
  const skillById = new Map(skillRows.map((skill) => [skill.id, skill.name]))
  const contactRows = db.select().from(contacts).all()
  const contactById = new Map(contactRows.map((contact) => [contact.id, contact]))
  const applicationRows = db.select().from(jobApplications).all()
  const postingRows = db.select().from(jobPostings).all()
  const postingApplicationById = new Map(
    postingRows.map((posting) => [posting.id, posting.jobApplicationId]),
  )
  const analysisRows = db.select().from(jobPostingAnalyses).all()
  const analysisApplicationById = new Map(
    analysisRows.map((analysis) => [
      analysis.id,
      postingApplicationById.get(analysis.jobPostingId),
    ]),
  )
  return {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    companies: companyRows,
    skills: skillRows,
    skillAliases: db.select().from(skillAliases).all(),
    contacts: contactRows.map((contact) => ({
      ...contact,
      companyName: companyById.get(contact.companyId),
    })),
    applications: applicationRows.map((application) => ({
      ...application,
      companyName: companyById.get(application.companyId),
    })),
    applicationSkills: db
      .select()
      .from(jobApplicationsToSkills)
      .all()
      .map((item) => ({
        ...item,
        skillName: skillById.get(item.skillId),
      })),
    applicationContacts: db
      .select()
      .from(jobApplicationsToContacts)
      .all()
      .map((item) => ({
        ...item,
        contact: contactById.get(item.contactId),
      })),
    followUps: db.select().from(followUps).all(),
    interviews: db.select().from(interviews).all(),
    jobPostings: postingRows,
    jobPostingAnalyses: analysisRows.map((analysis) => ({
      ...analysis,
      jobApplicationId: postingApplicationById.get(analysis.jobPostingId),
    })),
    jobRequirements: db
      .select()
      .from(jobRequirements)
      .all()
      .map((requirement) => ({
        ...requirement,
        jobApplicationId: analysisApplicationById.get(requirement.jobPostingAnalysisId),
      })),
    jobRequirementsToSkills: db.select().from(jobRequirementsToSkills).all(),
    applicationAnalysisRuns: db.select().from(applicationAnalysisRuns).all(),
    analysisRunDecisions: db.select().from(analysisRunDecisions).all(),
    generationRuns: db.select().from(generationRuns).all(),
    generationRunResults: db.select().from(generationRunResults).all(),
    documentReviews: db.select().from(documentReviews).all(),
  }
}

export type ImportPreview = {
  schemaVersion: number
  summary: Record<
    string,
    { created: number; updated: number; unchanged: number; conflicts: number }
  >
  conflicts: string[]
}

export function previewImport(payload: ImportPayload): ImportPreview {
  const localCompanies = db.select().from(companies).all()
  const localSkills = db.select().from(skills).all()
  const localContacts = db.select().from(contacts).all()
  const localApplications = db.select().from(jobApplications).all()
  const companyMap = new Map(localCompanies.map((item) => [key(item.name), item]))
  const skillMap = new Map(localSkills.map((item) => [key(item.name), item]))
  const companyNames = new Map(localCompanies.map((item) => [item.id, item.name]))
  const contactMap = new Map(
    localContacts.map((item) => [contactKey(item, companyNames.get(item.companyId) ?? ''), item]),
  )
  const applicationMap = new Map(
    localApplications.map((item) => [
      applicationKey(item, companyNames.get(item.companyId) ?? ''),
      item,
    ]),
  )
  const conflicts: string[] = []
  const compare = (
    incoming: Record<string, unknown>,
    existing: Record<string, unknown> | undefined,
  ) => existing && JSON.stringify(incoming) === JSON.stringify(existing)
  const count = (
    items: Record<string, unknown>[],
    map: Map<string, Record<string, unknown>>,
    getKey: (item: Record<string, unknown>) => string,
    label: string,
  ) => {
    let created = 0
    let updated = 0
    let unchanged = 0
    for (const item of items) {
      const itemKey = getKey(item)
      if (!itemKey.replaceAll('|', '')) {
        conflicts.push(`${label}: missing matching fields`)
        continue
      }
      const existing = map.get(itemKey)
      if (!existing) created++
      else if (compare(item, existing)) unchanged++
      else updated++
    }
    return { created, updated, unchanged, conflicts: conflicts.length }
  }
  const companiesSummary = count(payload.companies, companyMap, companyKey, 'Company')
  const skillsSummary = count(payload.skills, skillMap, skillKey, 'Skill')
  const contactsSummary = count(
    payload.contacts,
    contactMap,
    (item) => contactKey(item, textValue(item.companyName)),
    'Contact',
  )
  const applicationsSummary = count(
    payload.applications,
    applicationMap,
    (item) => applicationKey(item, textValue(item.companyName)),
    'Application',
  )
  return {
    schemaVersion: payload.schemaVersion,
    summary: {
      companies: companiesSummary,
      skills: skillsSummary,
      contacts: contactsSummary,
      applications: applicationsSummary,
      followUps: { created: payload.followUps.length, updated: 0, unchanged: 0, conflicts: 0 },
      interviews: { created: payload.interviews.length, updated: 0, unchanged: 0, conflicts: 0 },
    },
    conflicts: [
      ...conflicts,
      ...detectImportConflicts(payload),
      ...validateImportSnapshots(payload),
    ],
  }
}

export function mergeImport(payload: ImportPayload) {
  return db.transaction((tx) => {
    const companyIds = new Map<number, number>()
    const skillIds = new Map<number, number>()
    const contactIds = new Map<number, number>()
    const applicationIds = new Map<number, number>()
    const analysisIds = new Map<number, number>()
    const applicationAnalysisRunIds = new Map<number, number>()
    const generationRunIds = new Map<number, number>()
    const companiesByKey = new Map(
      tx
        .select()
        .from(companies)
        .all()
        .map((item) => [key(item.name), item]),
    )

    for (const incoming of payload.companies) {
      const name = textValue(incoming.name)
      if (!name) continue
      const existing = companiesByKey.get(companyKey(incoming))
      if (existing) {
        tx.update(companies)
          .set({ website: nullableText(incoming.website) })
          .where(eq(companies.id, existing.id))
          .run()
        companyIds.set(Number(incoming.id), existing.id)
      } else {
        const created = tx
          .insert(companies)
          .values({
            name,
            website: nullableText(incoming.website),
            createdAt: textValue(incoming.createdAt) || todayISO(),
          })
          .returning()
          .get()
        companiesByKey.set(companyKey(incoming), created)
        companyIds.set(Number(incoming.id), created.id)
      }
    }
    const skillRows = tx.select().from(skills).all()
    const skillsByKey = new Map(skillRows.map((item) => [item.key, item]))
    const skillsByCareerId = new Map(
      skillRows.filter((item) => item.careerSkillId).map((item) => [item.careerSkillId, item]),
    )
    const skillsByName = new Map(skillRows.map((item) => [normalizeSkillAlias(item.name), item]))
    const reviewValues = new Set<string>(['pending', 'approved', 'rejected', 'merged'])
    const originValues = new Set<string>(['career-data', 'job-parser', 'manual', 'import'])
    const category = (value: unknown) =>
      typeof value === 'string' && hasSkillCategory(value) ? (value as SkillCategory) : null
    const reviewStatus = (value: unknown) =>
      typeof value === 'string' && reviewValues.has(value)
        ? (value as SkillReviewStatus)
        : 'pending'
    const origin = (value: unknown) =>
      typeof value === 'string' && originValues.has(value) ? (value as SkillOrigin) : 'import'

    for (const incoming of payload.skills) {
      const name = textValue(incoming.name)
      if (!name) continue
      const careerSkillId = textValue(incoming.careerSkillId) || null
      const incomingKey = textValue(incoming.key) || normalizeSkillAlias(name)
      const existing =
        (careerSkillId && skillsByCareerId.get(careerSkillId)) ||
        skillsByKey.get(incomingKey) ||
        skillsByName.get(normalizeSkillAlias(name))
      if (existing) {
        tx.update(skills)
          .set({
            key: existing.careerSkillId ? existing.key : incomingKey,
            name,
            category: category(incoming.category) ?? existing.category,
            reviewStatus: existing.careerSkillId
              ? existing.reviewStatus
              : reviewStatus(incoming.reviewStatus),
            origin: existing.careerSkillId ? existing.origin : origin(incoming.origin),
            careerSkillId: careerSkillId ?? existing.careerSkillId,
            updatedAt: todayISO(),
          })
          .where(eq(skills.id, existing.id))
          .run()
        skillIds.set(Number(incoming.id), existing.id)
      } else {
        const created = insertSkill(tx, {
          name,
          key: incomingKey,
          category: category(incoming.category),
          reviewStatus: reviewStatus(incoming.reviewStatus),
          origin: origin(incoming.origin),
          careerSkillId,
        })
        skillsByKey.set(created.key, created)
        skillIds.set(Number(incoming.id), created.id)
      }
    }
    for (const incoming of payload.skillAliases) {
      const skillId = skillIds.get(Number(incoming.skillId))
      const alias = textValue(incoming.alias)
      if (!skillId || !alias) continue
      const normalized = normalizeSkillAlias(alias)
      const existing = tx
        .select()
        .from(skillAliases)
        .where(eq(skillAliases.normalizedAlias, normalized))
        .get()
      if (!existing)
        tx.insert(skillAliases)
          .values({
            skillId,
            alias,
            normalizedAlias: normalized,
            origin: 'import',
            createdAt: todayISO(),
          })
          .run()
    }
    const companyNameById = new Map(
      tx
        .select()
        .from(companies)
        .all()
        .map((item) => [item.id, item.name]),
    )
    for (const incoming of payload.contacts) {
      const companyId =
        companyIds.get(Number(incoming.companyId)) ??
        companiesByKey.get(key(incoming.companyName))?.id
      const name = textValue(incoming.name)
      if (!companyId || !name) continue
      const companyName = companyNameById.get(companyId) ?? textValue(incoming.companyName)
      const existing = tx
        .select()
        .from(contacts)
        .where(eq(contacts.companyId, companyId))
        .all()
        .find((item) => contactKey(item, companyName) === contactKey(incoming, companyName))
      const values = {
        companyId,
        name,
        email: nullableText(incoming.email),
        linkedinUrl: nullableText(incoming.linkedinUrl),
      }
      if (existing) {
        tx.update(contacts).set(values).where(eq(contacts.id, existing.id)).run()
        contactIds.set(Number(incoming.id), existing.id)
      } else {
        const created = tx.insert(contacts).values(values).returning().get()
        contactIds.set(Number(incoming.id), created.id)
      }
    }
    const applicationRows = tx.select().from(jobApplications).all()
    for (const incoming of payload.applications) {
      const companyId =
        companyIds.get(Number(incoming.companyId)) ??
        companiesByKey.get(key(incoming.companyName))?.id
      const companyName = companyNameById.get(companyId ?? 0) ?? textValue(incoming.companyName)
      const title = textValue(incoming.jobTitle)
      const postedDate = textValue(incoming.postedDate)
      if (!companyId || !title || !postedDate) continue
      const existing = applicationRows.find(
        (item) => applicationKey(item, companyName) === applicationKey(incoming, companyName),
      )
      const values = {
        companyId,
        jobTitle: title,
        direction: textValue(incoming.direction) || 'fullstack',
        location: nullableText(incoming.location),
        url: nullableText(incoming.url),
        postedDate,
        priority: controlledValue(priorities, incoming.priority, 'B'),
        appliedDate: nullableText(incoming.appliedDate),
        resumeVersion: nullableText(incoming.resumeVersion),
        matchLevel: controlledValue(matchLevels, incoming.matchLevel, null),
        applicationSource: nullableText(incoming.applicationSource),
        salary: nullableText(incoming.salary),
        notes: nullableText(incoming.notes),
        status: controlledValue(statuses, incoming.status, 'Saved'),
        statusBeforeArchive: controlledValue(statuses, incoming.statusBeforeArchive, null),
        applyTodayTargetDate: nullableText(incoming.applyTodayTargetDate),
        createdAt: textValue(incoming.createdAt) || todayISO(),
        updatedAt: textValue(incoming.updatedAt) || todayISO(),
      }
      if (existing) {
        tx.update(jobApplications).set(values).where(eq(jobApplications.id, existing.id)).run()
        applicationIds.set(Number(incoming.id), existing.id)
      } else {
        const created = tx.insert(jobApplications).values(values).returning().get()
        applicationIds.set(Number(incoming.id), created.id)
      }
    }
    for (const relation of payload.applicationSkills) {
      const relationRecord = relation as Record<string, unknown>
      const applicationId = applicationIds.get(Number(relationRecord.jobApplicationId))
      const skillId =
        skillIds.get(Number(relationRecord.skillId)) ??
        skillsByKey.get(key(relationRecord.skillName))?.id
      if (applicationId && skillId) {
        const date = todayISO()
        const importanceValue = relationRecord.importance
        const analysisResultValue = relationRecord.analysisResult
        const userDecisionValue = relationRecord.userDecision
        const reason = textValue(relationRecord.decisionReason) || null
        tx.insert(jobApplicationsToSkills)
          .values({
            jobApplicationId: applicationId,
            skillId,
            rawLabel:
              textValue(relationRecord.rawLabel) || textValue(relationRecord.skillName) || null,
            sourceText: textValue(relationRecord.sourceText) || null,
            importance: controlledValue(skillImportances, importanceValue, 'mentioned'),
            parserConfidence:
              typeof relationRecord.parserConfidence === 'number'
                ? relationRecord.parserConfidence
                : null,
            analysisResult: controlledValue(
              skillMatchResults,
              analysisResultValue,
              'not-in-career-data',
            ),
            userDecision: controlledValue(skillDecisions, userDecisionValue, 'pending'),
            decisionReason: reason,
            createdAt: textValue(relationRecord.createdAt) || date,
            updatedAt: textValue(relationRecord.updatedAt) || date,
          })
          .onConflictDoNothing()
          .run()
      }
    }
    for (const relation of payload.applicationContacts) {
      const applicationId = applicationIds.get(Number(relation.jobApplicationId))
      const contactId = contactIds.get(Number(relation.contactId))
      if (applicationId && contactId)
        tx.insert(jobApplicationsToContacts)
          .values({ jobApplicationId: applicationId, contactId })
          .onConflictDoNothing()
          .run()
    }
    for (const incoming of payload.followUps) {
      const applicationId = applicationIds.get(Number(incoming.jobApplicationId))
      if (!applicationId || !textValue(incoming.actionDate)) continue
      const exists = tx
        .select()
        .from(followUps)
        .where(
          and(
            eq(followUps.jobApplicationId, applicationId),
            eq(followUps.actionDate, textValue(incoming.actionDate)),
          ),
        )
        .all()
        .find((item) => item.notes === nullableText(incoming.notes))
      if (!exists)
        tx.insert(followUps)
          .values({
            jobApplicationId: applicationId,
            actionDate: textValue(incoming.actionDate),
            notes: nullableText(incoming.notes),
          })
          .run()
    }
    for (const incoming of payload.interviews) {
      const applicationId = applicationIds.get(Number(incoming.jobApplicationId))
      if (!applicationId || !textValue(incoming.interviewDate) || !textValue(incoming.roundName))
        continue
      const exists = tx
        .select()
        .from(interviews)
        .where(
          and(
            eq(interviews.jobApplicationId, applicationId),
            eq(interviews.interviewDate, textValue(incoming.interviewDate)),
            eq(interviews.roundName, textValue(incoming.roundName)),
          ),
        )
        .get()
      if (!exists)
        tx.insert(interviews)
          .values({
            jobApplicationId: applicationId,
            interviewDate: textValue(incoming.interviewDate),
            roundName: textValue(incoming.roundName),
            notes: nullableText(incoming.notes),
          })
          .run()
    }
    for (const incoming of payload.jobPostings) {
      const applicationId = applicationIds.get(Number(incoming.jobApplicationId))
      const rawText = textValue(incoming.rawText)
      if (!applicationId || !rawText) continue
      const values = {
        jobApplicationId: applicationId,
        rawText,
        capturedAt: textValue(incoming.capturedAt) || todayISO(),
        contentHash:
          textValue(incoming.contentHash) || createHash('sha256').update(rawText).digest('hex'),
        parsedAt: nullableText(incoming.parsedAt),
        parserModel: nullableText(incoming.parserModel),
        parserPromptVersion: nullableText(incoming.parserPromptVersion),
      }
      const existing = tx
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.jobApplicationId, applicationId))
        .get()
      if (existing) tx.update(jobPostings).set(values).where(eq(jobPostings.id, existing.id)).run()
      else tx.insert(jobPostings).values(values).run()
    }
    for (const incoming of payload.jobPostingAnalyses) {
      const applicationId = applicationIds.get(Number(incoming.jobApplicationId))
      if (!applicationId) continue
      const posting = tx
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.jobApplicationId, applicationId))
        .get()
      if (!posting) continue
      const queueJobId = nullableText(incoming.queueJobId)
      const existing = queueJobId
        ? tx
            .select()
            .from(jobPostingAnalyses)
            .where(eq(jobPostingAnalyses.queueJobId, queueJobId))
            .get()
        : undefined
      const values = {
        jobPostingId: posting.id,
        status: controlledValue(runStatuses, incoming.status, 'Completed'),
        queueJobId,
        attempts: Number(incoming.attempts) || 0,
        inputHash: nullableText(incoming.inputHash),
        frozenInputJson: nullableText(incoming.frozenInputJson),
        errorMessage: nullableText(incoming.errorMessage),
        requirements: nullableText(incoming.requirements),
        responsibilities: nullableText(incoming.responsibilities),
        painPoints: nullableText(incoming.painPoints),
        culture: nullableText(incoming.culture),
        redFlags: nullableText(incoming.redFlags),
        successMetrics: nullableText(incoming.successMetrics),
        benefits: nullableText(incoming.benefits),
        notes: nullableText(incoming.notes),
        generatedAt: textValue(incoming.generatedAt) || todayISO(),
        model: nullableText(incoming.model),
        promptVersion: nullableText(incoming.promptVersion),
        summary: nullableText(incoming.summary),
        roleType: nullableText(incoming.roleType),
        advertisedSeniority: nullableText(incoming.advertisedSeniority),
        practicalSeniority: nullableText(incoming.practicalSeniority),
        classificationRationale: nullableText(incoming.classificationRationale),
        functionalEmphasisJson: nullableText(incoming.functionalEmphasisJson),
        interviewQuestionsJson: nullableText(incoming.interviewQuestionsJson),
        schemaVersion: nullableText(incoming.schemaVersion),
        createdAt: textValue(incoming.createdAt) || todayISO(),
        updatedAt: textValue(incoming.updatedAt) || todayISO(),
        startedAt: nullableText(incoming.startedAt),
        completedAt: nullableText(incoming.completedAt),
      }
      if (existing) analysisIds.set(Number(incoming.id), existing.id)
      else {
        const created = tx
          .insert(jobPostingAnalyses)
          .values(values)
          .returning({ id: jobPostingAnalyses.id })
          .get()
        analysisIds.set(Number(incoming.id), created.id)
      }
    }
    for (const incoming of payload.jobRequirements) {
      const analysisId = analysisIds.get(Number(incoming.jobPostingAnalysisId))
      if (!analysisId || !textValue(incoming.statement)) continue
      const existing = tx
        .select()
        .from(jobRequirements)
        .where(
          and(
            eq(jobRequirements.jobPostingAnalysisId, analysisId),
            eq(jobRequirements.sequence, Number(incoming.sequence)),
          ),
        )
        .get()
      const values = {
        jobPostingAnalysisId: analysisId,
        sequence: Number(incoming.sequence) || 1,
        requirementType: controlledValue(requirementTypes, incoming.requirementType, 'experience'),
        importance: controlledValue(requirementImportances, incoming.importance, 'mentioned'),
        basis: controlledValue(persistedRequirementBases, incoming.basis, 'legacy'),
        statement: textValue(incoming.statement),
        sourceText: nullableText(incoming.sourceText),
        inferenceRationale: nullableText(incoming.inferenceRationale),
        createdAt: textValue(incoming.createdAt) || todayISO(),
        updatedAt: textValue(incoming.updatedAt) || todayISO(),
      }
      if (existing)
        tx.update(jobRequirements).set(values).where(eq(jobRequirements.id, existing.id)).run()
      else tx.insert(jobRequirements).values(values).run()
    }
    for (const incoming of payload.jobRequirementsToSkills) {
      const requirementId = Number(incoming.jobRequirementId)
      const skillId = skillIds.get(Number(incoming.skillId))
      if (!requirementId || !skillId) continue
      tx.insert(jobRequirementsToSkills)
        .values({ jobRequirementId: requirementId, skillId })
        .onConflictDoNothing()
        .run()
    }
    for (const incoming of payload.applicationAnalysisRuns) {
      const applicationId = applicationIds.get(Number(incoming.jobApplicationId))
      if (!applicationId) continue
      const queueJobId = textValue(incoming.queueJobId) || `analysis-import-${incoming.id}`
      const existing = tx
        .select()
        .from(applicationAnalysisRuns)
        .where(eq(applicationAnalysisRuns.queueJobId, queueJobId))
        .get()
      const values = {
        jobApplicationId: applicationId,
        status: controlledValue(runStatuses, incoming.status, 'Completed'),
        queueJobId,
        attempts: Number(incoming.attempts) || 0,
        inputHash: nullableText(incoming.inputHash),
        inputSnapshotJson: nullableText(incoming.inputSnapshotJson),
        resultJson: nullableText(incoming.resultJson),
        model: nullableText(incoming.model),
        promptVersion: nullableText(incoming.promptVersion),
        schemaVersion: nullableText(incoming.schemaVersion),
        errorMessage: nullableText(incoming.errorMessage),
        recommendedProfileId: nullableText(incoming.recommendedProfileId),
        confirmedProfileId: nullableText(incoming.confirmedProfileId),
        profileConfirmedAt: nullableText(incoming.profileConfirmedAt),
        createdAt: textValue(incoming.createdAt) || todayISO(),
        updatedAt: textValue(incoming.updatedAt) || todayISO(),
        startedAt: nullableText(incoming.startedAt),
        completedAt: nullableText(incoming.completedAt),
      }
      if (existing) applicationAnalysisRunIds.set(Number(incoming.id), existing.id)
      else {
        const created = tx
          .insert(applicationAnalysisRuns)
          .values(values)
          .returning({ id: applicationAnalysisRuns.id })
          .get()
        applicationAnalysisRunIds.set(Number(incoming.id), created.id)
      }
    }
    for (const incoming of payload.analysisRunDecisions) {
      const runId = applicationAnalysisRunIds.get(Number(incoming.applicationAnalysisRunId))
      const skillId = skillIds.get(Number(incoming.skillId))
      if (!runId || !skillId) continue
      const date = todayISO()
      tx.insert(analysisRunDecisions)
        .values({
          applicationAnalysisRunId: runId,
          skillId,
          decision: controlledValue(skillDecisions, incoming.decision, 'pending'),
          reason: nullableText(incoming.reason),
          createdAt: textValue(incoming.createdAt) || date,
          updatedAt: textValue(incoming.updatedAt) || date,
        })
        .onConflictDoNothing()
        .run()
    }
    for (const incoming of payload.generationRuns) {
      const applicationId = applicationIds.get(Number(incoming.jobApplicationId))
      if (!applicationId) continue
      const queueJobId = textValue(incoming.queueJobId) || `generation-import-${incoming.id}`
      const existing = tx
        .select()
        .from(generationRuns)
        .where(eq(generationRuns.queueJobId, queueJobId))
        .get()
      const values = {
        jobApplicationId: applicationId,
        status: controlledValue(runStatuses, incoming.status, 'Completed'),
        queueJobId,
        attempts: Number(incoming.attempts) || 0,
        inputHash: nullableText(incoming.inputHash),
        frozenInputJson: nullableText(incoming.frozenInputJson),
        resumeModel: nullableText(incoming.resumeModel),
        coverLetterModel: nullableText(incoming.coverLetterModel),
        promptVersion: nullableText(incoming.promptVersion),
        schemaVersion: nullableText(incoming.schemaVersion),
        errorMessage: nullableText(incoming.errorMessage),
        createdAt: textValue(incoming.createdAt) || todayISO(),
        updatedAt: textValue(incoming.updatedAt) || todayISO(),
        startedAt: nullableText(incoming.startedAt),
        completedAt: nullableText(incoming.completedAt),
      }
      if (existing) {
        tx.update(generationRuns).set(values).where(eq(generationRuns.id, existing.id)).run()
        generationRunIds.set(Number(incoming.id), existing.id)
      } else {
        const created = tx
          .insert(generationRuns)
          .values(values)
          .returning({ id: generationRuns.id })
          .get()
        generationRunIds.set(Number(incoming.id), created.id)
      }
    }
    for (const incoming of payload.generationRunResults) {
      const runId = generationRunIds.get(Number(incoming.generationRunId))
      if (!runId) continue
      tx.insert(generationRunResults)
        .values({
          generationRunId: runId,
          resumeJson: nullableText(incoming.resumeJson),
          coverLetterJson: nullableText(incoming.coverLetterJson),
          atsAuditJson: nullableText(incoming.atsAuditJson),
          createdAt: textValue(incoming.createdAt) || todayISO(),
          updatedAt: textValue(incoming.updatedAt) || todayISO(),
        })
        .onConflictDoNothing()
        .run()
    }
    for (const incoming of payload.documentReviews) {
      const runId = generationRunIds.get(Number(incoming.generationRunId))
      if (!runId) continue
      tx.insert(documentReviews)
        .values({
          generationRunId: runId,
          status: controlledValue(runStatuses, incoming.status, 'Completed'),
          queueJobId: textValue(incoming.queueJobId) || `document-review-import-${incoming.id}`,
          attempts: Number(incoming.attempts) || 0,
          inputHash: nullableText(incoming.inputHash),
          resultJson: nullableText(incoming.resultJson),
          model: nullableText(incoming.model),
          promptVersion: nullableText(incoming.promptVersion),
          schemaVersion: nullableText(incoming.schemaVersion),
          errorMessage: nullableText(incoming.errorMessage),
          createdAt: textValue(incoming.createdAt) || todayISO(),
          updatedAt: textValue(incoming.updatedAt) || todayISO(),
          startedAt: nullableText(incoming.startedAt),
          completedAt: nullableText(incoming.completedAt),
        })
        .onConflictDoNothing()
        .run()
    }
  })
}

export function createSkill(name: string) {
  getOrCreateSkill(db, name, 'manual')
}

export function createCompany(name: string, website?: string | null) {
  db.insert(companies)
    .values({ name, website: website ?? null, createdAt: todayISO() })
    .onConflictDoNothing()
    .run()
}

export function createContact(input: {
  companyId: number
  name: string
  email?: string | null
  linkedinUrl?: string | null
}) {
  db.insert(contacts)
    .values({ ...input, email: input.email ?? null, linkedinUrl: input.linkedinUrl ?? null })
    .run()
}

export function updateManagedItem(
  kind: 'skills' | 'companies' | 'contacts',
  id: number,
  input:
    | { name: string }
    | { name: string; website?: string | null }
    | { companyId: number; name: string; email?: string | null; linkedinUrl?: string | null },
) {
  if (kind === 'skills') {
    db.update(skills)
      .set({
        name: input.name,
        key: normalizeSkillAlias(input.name),
        updatedAt: todayISO(),
      })
      .where(eq(skills.id, id))
      .run()
    return
  }
  if (kind === 'companies') {
    const company = input as { name: string; website?: string | null }
    db.update(companies)
      .set({ name: company.name, website: company.website ?? null })
      .where(eq(companies.id, id))
      .run()
    return
  }
  const contact = input as {
    companyId: number
    name: string
    email?: string | null
    linkedinUrl?: string | null
  }
  db.update(contacts)
    .set({
      companyId: contact.companyId,
      name: contact.name,
      email: contact.email ?? null,
      linkedinUrl: contact.linkedinUrl ?? null,
    })
    .where(eq(contacts.id, id))
    .run()
}

export function updateSkillDetails(
  id: number,
  input: { name: string; category?: string | null; reviewStatus: SkillReviewStatus },
) {
  db.update(skills)
    .set({
      name: input.name,
      key: normalizeSkillAlias(input.name),
      category: input.category ?? null,
      reviewStatus: input.reviewStatus,
      updatedAt: todayISO(),
    })
    .where(eq(skills.id, id))
    .run()
}

export function deleteManagedItem(kind: 'skills' | 'companies' | 'contacts', id: number) {
  try {
    if (kind === 'skills') db.delete(skills).where(eq(skills.id, id)).run()
    if (kind === 'companies') db.delete(companies).where(eq(companies.id, id)).run()
    if (kind === 'contacts') db.delete(contacts).where(eq(contacts.id, id)).run()
    return true
  } catch {
    return false
  }
}

export function getActivity(id: number) {
  return {
    followUps: db
      .select()
      .from(followUps)
      .where(eq(followUps.jobApplicationId, id))
      .orderBy(sql`${followUps.actionDate} desc, ${followUps.id} desc`)
      .all(),
    interviews: db
      .select()
      .from(interviews)
      .where(eq(interviews.jobApplicationId, id))
      .orderBy(sql`${interviews.interviewDate} desc, ${interviews.id} desc`)
      .all(),
  }
}

export function metrics() {
  const rows = db
    .select({ status: jobApplications.status, count: sql<number>`count(*)` })
    .from(jobApplications)
    .groupBy(jobApplications.status)
    .all()
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)])) as Partial<
    Record<JobApplication['status'], number>
  >
}

export function changeStatus(
  id: number,
  action: 'today' | 'reject' | 'archive' | 'restore' | 'applied',
) {
  const job = db.select().from(jobApplications).where(eq(jobApplications.id, id)).get()
  if (!job) return false
  const date = todayISO()
  if (action === 'today')
    db.update(jobApplications)
      .set({ status: 'Apply Today', applyTodayTargetDate: date, updatedAt: date })
      .where(eq(jobApplications.id, id))
      .run()
  if (action === 'applied')
    db.update(jobApplications)
      .set({ status: 'Applied', appliedDate: date, updatedAt: date })
      .where(eq(jobApplications.id, id))
      .run()
  if (action === 'reject')
    db.update(jobApplications)
      .set({ status: 'Rejected', updatedAt: date })
      .where(eq(jobApplications.id, id))
      .run()
  if (action === 'archive')
    db.update(jobApplications)
      .set({ statusBeforeArchive: job.status, status: 'Archived', updatedAt: date })
      .where(eq(jobApplications.id, id))
      .run()
  if (action === 'restore') {
    const restored =
      job.statusBeforeArchive && job.statusBeforeArchive !== 'Archived'
        ? job.statusBeforeArchive
        : 'Saved'
    db.update(jobApplications)
      .set({ status: restored, statusBeforeArchive: null, updatedAt: date })
      .where(eq(jobApplications.id, id))
      .run()
  }
  return true
}

export function addFollowUp(id: number, input: { actionDate: string; notes?: string | null }) {
  return db.transaction((tx) => {
    const job = tx.select().from(jobApplications).where(eq(jobApplications.id, id)).get()
    if (!job) return false
    tx.insert(followUps)
      .values({ jobApplicationId: id, actionDate: input.actionDate, notes: input.notes })
      .run()
    tx.update(jobApplications)
      .set({ status: advanceStatus(job.status, 'Follow Up'), updatedAt: todayISO() })
      .where(eq(jobApplications.id, id))
      .run()
    return true
  })
}

export function addInterview(
  id: number,
  input: { interviewDate: string; roundName: string; notes?: string | null },
) {
  return db.transaction((tx) => {
    const job = tx.select().from(jobApplications).where(eq(jobApplications.id, id)).get()
    if (!job) return false
    tx.insert(interviews)
      .values({
        jobApplicationId: id,
        interviewDate: input.interviewDate,
        roundName: input.roundName,
        notes: input.notes,
      })
      .run()
    tx.update(jobApplications)
      .set({ status: advanceStatus(job.status, 'Interviewing'), updatedAt: todayISO() })
      .where(eq(jobApplications.id, id))
      .run()
    return true
  })
}
