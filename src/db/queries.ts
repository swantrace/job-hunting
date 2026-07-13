import { createHash } from 'node:crypto'
import { and, eq, inArray, like, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { todayISO } from '../lib/date'
import {
  applicationKey,
  companyKey,
  contactKey,
  type ImportPayload,
  key,
  nullableText,
  tagKey,
  textValue,
} from '../lib/import'
import { advanceStatus } from '../lib/transitions'
import type { applicationSchema, filterSchema, quickCollectSchema } from '../lib/validation'
import { db } from './client'
import {
  companies,
  contacts,
  followUps,
  interviews,
  type JobApplication,
  type JobStatus,
  jobApplications,
  jobApplicationsToContacts,
  jobApplicationsToTags,
  jobPostings,
  statuses,
  tags,
} from './schema'

export type Filters = z.infer<typeof filterSchema>
export type JobCardData = JobApplication & {
  companyName: string
  companyWebsite: string | null
  tags: string[]
  contacts?: (typeof contacts.$inferSelect)[]
  jobPosting?: typeof jobPostings.$inferSelect
}

const cleanTags = (value?: string | null) =>
  [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20)

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'delete'>

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

function replaceTags(tx: DbExecutor, jobId: number, names: string[]) {
  tx.delete(jobApplicationsToTags).where(eq(jobApplicationsToTags.jobApplicationId, jobId)).run()
  for (const name of names) {
    tx.insert(tags).values({ name }).onConflictDoNothing().run()
    const tag = tx.select().from(tags).where(sql`lower(${tags.name}) = lower(${name})`).get()
    if (tag)
      tx.insert(jobApplicationsToTags)
        .values({ jobApplicationId: jobId, tagId: tag.id })
        .onConflictDoNothing()
        .run()
  }
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
    replaceTags(tx, result.id, cleanTags(input.tags))
    const rawText = input.jobPostText?.trim()
    if (rawText) {
      tx.insert(jobPostings)
        .values({
          jobApplicationId: result.id,
          rawText,
          capturedAt: date,
          contentHash: createHash('sha256').update(rawText).digest('hex'),
        })
        .run()
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
        status:
          existing.status === 'Rejected' || existing.status === 'Archived'
            ? existing.status
            : 'Applied',
        updatedAt: date,
      })
      .where(eq(jobApplications.id, id))
      .run()
    replaceTags(tx, id, cleanTags(input.tags))
    return true
  })
}

export function listApplications(filters: Filters): JobCardData[] {
  const conditions = []
  if (filters.view === 'active')
    conditions.push(
      inArray(jobApplications.status, [
        'Saved',
        'Apply Today',
        'Applied',
        'Follow Up',
        'Interviewing',
      ]),
    )
  else conditions.push(eq(jobApplications.status, filters.view))
  if (filters.priority) conditions.push(eq(jobApplications.priority, filters.priority))
  if (filters.today)
    conditions.push(
      and(
        eq(jobApplications.status, 'Apply Today'),
        eq(jobApplications.applyTodayTargetDate, todayISO()),
      )!,
    )
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
  } as const
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
  const tagRows = db
    .select({ jobId: jobApplicationsToTags.jobApplicationId, name: tags.name })
    .from(jobApplicationsToTags)
    .innerJoin(tags, eq(jobApplicationsToTags.tagId, tags.id))
    .where(
      inArray(
        jobApplicationsToTags.jobApplicationId,
        rows.map((row) => row.job.id),
      ),
    )
    .all()
  return rows.map((row) => ({
    ...row.job,
    companyName: row.companyName,
    companyWebsite: row.companyWebsite,
    tags: tagRows.filter((tag) => tag.jobId === row.job.id).map((tag) => tag.name),
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
  const jobTags = db
    .select({ name: tags.name })
    .from(jobApplicationsToTags)
    .innerJoin(tags, eq(jobApplicationsToTags.tagId, tags.id))
    .where(eq(jobApplicationsToTags.jobApplicationId, id))
    .all()
    .map((tag) => tag.name)
  const jobPosting = db.select().from(jobPostings).where(eq(jobPostings.jobApplicationId, id)).get()
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
    tags: jobTags,
    contacts: jobContacts,
    jobPosting,
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
    tags: db.select().from(tags).orderBy(sql`lower(${tags.name})`).all(),
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
  const tagRows = db.select().from(tags).all()
  const tagById = new Map(tagRows.map((tag) => [tag.id, tag.name]))
  const contactRows = db.select().from(contacts).all()
  const contactById = new Map(contactRows.map((contact) => [contact.id, contact]))
  const applicationRows = db.select().from(jobApplications).all()
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    companies: companyRows,
    tags: tagRows,
    contacts: contactRows.map((contact) => ({
      ...contact,
      companyName: companyById.get(contact.companyId),
    })),
    applications: applicationRows.map((application) => ({
      ...application,
      companyName: companyById.get(application.companyId),
    })),
    applicationTags: db
      .select()
      .from(jobApplicationsToTags)
      .all()
      .map((item) => ({
        ...item,
        tagName: tagById.get(item.tagId),
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
    jobPostings: db.select().from(jobPostings).all(),
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
  const localTags = db.select().from(tags).all()
  const localContacts = db.select().from(contacts).all()
  const localApplications = db.select().from(jobApplications).all()
  const companyMap = new Map(localCompanies.map((item) => [key(item.name), item]))
  const tagMap = new Map(localTags.map((item) => [key(item.name), item]))
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
  const tagsSummary = count(payload.tags, tagMap, tagKey, 'Tag')
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
      tags: tagsSummary,
      contacts: contactsSummary,
      applications: applicationsSummary,
      followUps: { created: payload.followUps.length, updated: 0, unchanged: 0, conflicts: 0 },
      interviews: { created: payload.interviews.length, updated: 0, unchanged: 0, conflicts: 0 },
    },
    conflicts,
  }
}

export function mergeImport(payload: ImportPayload) {
  return db.transaction((tx) => {
    const companyIds = new Map<number, number>()
    const tagIds = new Map<number, number>()
    const contactIds = new Map<number, number>()
    const applicationIds = new Map<number, number>()
    const companiesByKey = new Map(
      tx
        .select()
        .from(companies)
        .all()
        .map((item) => [key(item.name), item]),
    )
    const tagsByKey = new Map(
      tx
        .select()
        .from(tags)
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
    for (const incoming of payload.tags) {
      const name = textValue(incoming.name)
      if (!name) continue
      const existing = tagsByKey.get(tagKey(incoming))
      if (existing) tagIds.set(Number(incoming.id), existing.id)
      else {
        const created = tx.insert(tags).values({ name }).returning().get()
        tagsByKey.set(tagKey(incoming), created)
        tagIds.set(Number(incoming.id), created.id)
      }
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
        location: nullableText(incoming.location),
        url: nullableText(incoming.url),
        postedDate,
        priority: (['A', 'B', 'C'].includes(textValue(incoming.priority))
          ? textValue(incoming.priority)
          : 'B') as 'A' | 'B' | 'C',
        appliedDate: nullableText(incoming.appliedDate),
        resumeVersion: nullableText(incoming.resumeVersion),
        matchLevel: (['A', 'B'].includes(textValue(incoming.matchLevel))
          ? textValue(incoming.matchLevel)
          : null) as 'A' | 'B' | null,
        applicationSource: nullableText(incoming.applicationSource),
        salary: nullableText(incoming.salary),
        notes: nullableText(incoming.notes),
        status: (statuses.includes(textValue(incoming.status) as JobStatus)
          ? textValue(incoming.status)
          : 'Saved') as JobStatus,
        statusBeforeArchive: nullableText(incoming.statusBeforeArchive) as JobStatus | null,
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
    for (const relation of payload.applicationTags) {
      const applicationId = applicationIds.get(Number(relation.jobApplicationId))
      const tagId = tagIds.get(Number(relation.tagId)) ?? tagsByKey.get(key(relation.tagName))?.id
      if (applicationId && tagId)
        tx.insert(jobApplicationsToTags)
          .values({ jobApplicationId: applicationId, tagId })
          .onConflictDoNothing()
          .run()
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
  })
}

export function createTag(name: string) {
  db.insert(tags).values({ name }).onConflictDoNothing().run()
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

export function deleteManagedItem(kind: 'tags' | 'companies' | 'contacts', id: number) {
  try {
    if (kind === 'tags') db.delete(tags).where(eq(tags.id, id)).run()
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

export function changeStatus(id: number, action: 'today' | 'reject' | 'archive' | 'restore') {
  const job = db.select().from(jobApplications).where(eq(jobApplications.id, id)).get()
  if (!job) return false
  const date = todayISO()
  if (action === 'today')
    db.update(jobApplications)
      .set({ status: 'Apply Today', applyTodayTargetDate: date, updatedAt: date })
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
