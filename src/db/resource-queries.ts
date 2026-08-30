import { sql } from 'drizzle-orm'
import { db } from './client'
import {
  companies,
  contacts,
  jobApplications,
  jobApplicationsToContacts,
  jobPostingAnalyses,
  jobPostings,
  jobRequirements,
  jobRequirementsToSkills,
  type Skill,
  skillAliases,
  skills,
} from './schema'

export type SkillOverview = Skill & { aliasCount: number; applicationCount: number }
export type CompanyOverview = typeof companies.$inferSelect & {
  applicationCount: number
  contactCount: number
  lastActivity: string | null
}
export type ContactOverview = typeof contacts.$inferSelect & {
  companyName: string
  applicationCount: number
  lastInteraction: string | null
}

export function listSkillsOverview(): SkillOverview[] {
  const skillRows = db.select().from(skills).orderBy(sql`lower(${skills.name})`).all()
  const aliases = db.select().from(skillAliases).all()
  const relations = db
    .select({
      skillId: jobRequirementsToSkills.skillId,
      applicationId: jobPostings.jobApplicationId,
    })
    .from(jobRequirementsToSkills)
    .innerJoin(
      jobRequirements,
      sql`${jobRequirements.id} = ${jobRequirementsToSkills.jobRequirementId}`,
    )
    .innerJoin(
      jobPostingAnalyses,
      sql`${jobPostingAnalyses.id} = ${jobRequirements.jobPostingAnalysisId}`,
    )
    .innerJoin(jobPostings, sql`${jobPostings.id} = ${jobPostingAnalyses.jobPostingId}`)
    .all()
  const aliasCount = new Map<number, number>()
  const applicationIdsBySkill = new Map<number, Set<number>>()
  for (const alias of aliases)
    aliasCount.set(alias.skillId, (aliasCount.get(alias.skillId) ?? 0) + 1)
  for (const relation of relations) {
    const set = applicationIdsBySkill.get(relation.skillId) ?? new Set()
    set.add(relation.applicationId)
    applicationIdsBySkill.set(relation.skillId, set)
  }
  return skillRows.map((skill) => ({
    ...skill,
    aliasCount: aliasCount.get(skill.id) ?? 0,
    applicationCount: applicationIdsBySkill.get(skill.id)?.size ?? 0,
  }))
}

export function listCompaniesOverview(): CompanyOverview[] {
  const companyRows = db.select().from(companies).orderBy(sql`lower(${companies.name})`).all()
  const applications = db.select().from(jobApplications).all()
  const contactRows = db.select().from(contacts).all()
  const applicationCount = new Map<number, number>()
  const contactCount = new Map<number, number>()
  const lastActivity = new Map<number, string>()
  for (const application of applications) {
    applicationCount.set(
      application.companyId,
      (applicationCount.get(application.companyId) ?? 0) + 1,
    )
    const current = lastActivity.get(application.companyId)
    if (!current || application.updatedAt > current)
      lastActivity.set(application.companyId, application.updatedAt)
  }
  for (const contact of contactRows)
    contactCount.set(contact.companyId, (contactCount.get(contact.companyId) ?? 0) + 1)
  return companyRows.map((company) => ({
    ...company,
    applicationCount: applicationCount.get(company.id) ?? 0,
    contactCount: contactCount.get(company.id) ?? 0,
    lastActivity: lastActivity.get(company.id) ?? null,
  }))
}

export function listContactsOverview(): ContactOverview[] {
  const contactRows = db
    .select({ contact: contacts, companyName: companies.name })
    .from(contacts)
    .innerJoin(companies, sql`${companies.id} = ${contacts.companyId}`)
    .orderBy(sql`lower(${contacts.name})`)
    .all()
  const relations = db.select().from(jobApplicationsToContacts).all()
  const applicationCount = new Map<number, number>()
  for (const relation of relations)
    applicationCount.set(relation.contactId, (applicationCount.get(relation.contactId) ?? 0) + 1)
  return contactRows.map(({ contact, companyName }) => ({
    ...contact,
    companyName,
    applicationCount: applicationCount.get(contact.id) ?? 0,
    lastInteraction: null,
  }))
}
