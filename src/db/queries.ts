import { and, eq, inArray, like, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { todayISO } from '../lib/date'
import { advanceStatus } from '../lib/transitions'
import type { applicationSchema, filterSchema, quickCollectSchema } from '../lib/validation'
import { db } from './client'
import {
  companies,
  contacts,
  followUps,
  interviews,
  type JobApplication,
  jobApplications,
  jobApplicationsToContacts,
  jobApplicationsToTags,
  tags,
} from './schema'

export type Filters = z.infer<typeof filterSchema>
export type JobCardData = JobApplication & {
  companyName: string
  companyWebsite: string | null
  tags: string[]
  contacts?: (typeof contacts.$inferSelect)[]
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
        priority: input.priority,
        status: 'Saved',
        createdAt: date,
        updatedAt: date,
      })
      .returning({ id: jobApplications.id })
      .get()
    replaceTags(tx, result.id, cleanTags(input.tags))
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
