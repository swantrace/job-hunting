import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const profileSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
})

export type ProfileOption = z.infer<typeof profileSchema>

const documentProfileSchema = profileSchema.extend({
  templates: z.object({
    resume: z.string().trim().min(1),
    coverLetter: z.string().trim().min(1),
  }),
  targetTitle: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  skills: z.array(z.object({ label: z.string().trim().min(1), items: z.string().trim().min(1) })),
  experiences: z.array(
    z.object({
      id: z.string().trim().min(1),
      role: z.string().trim().min(1),
      company: z.string().trim().min(1),
      displayDates: z.string().trim().min(1),
      bullets: z.array(z.object({ id: z.string().trim().min(1), text: z.string().trim().min(1) })),
    }),
  ),
  education: z.array(
    z.object({ degree: z.string().trim().min(1), school: z.string().trim().min(1) }),
  ),
  coverLetter: z.object({
    openingParagraph: z.string().trim().min(1),
    evidenceParagraph: z.string().trim().min(1),
    closingParagraph: z.string().trim().min(1),
  }),
})

const candidateProfileSchema = z.object({
  candidateName: z.string().trim().min(1),
  location: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email(),
  linkedin: z.string().trim().url(),
  github: z.string().trim().url(),
})

export type DocumentProfile = z.infer<typeof documentProfileSchema>
export type CandidateProfile = z.infer<typeof candidateProfileSchema>

function profileDirectory() {
  const candidates = [resolve(process.cwd(), 'profiles'), resolve(process.cwd(), '../profiles')]
  const directory = candidates.find(existsSync)
  if (!directory) throw new Error('Profiles directory was not found.')
  return directory
}

function readProfileFile(file: string) {
  return JSON.parse(readFileSync(resolve(profileDirectory(), file), 'utf8'))
}

export function listProfiles(): ProfileOption[] {
  const profiles = readdirSync(profileDirectory())
    .filter((file) => file.endsWith('.profile.json'))
    .map((file) => {
      const profile = profileSchema.parse(readProfileFile(file))
      const filenameId = file.replace(/\.profile\.json$/, '')
      if (profile.id !== filenameId)
        throw new Error(`Profile id "${profile.id}" must match filename "${filenameId}".`)
      return profile
    })
    .sort((a, b) => a.label.localeCompare(b.label))
  if (!profiles.length) throw new Error('At least one profile is required.')
  return profiles
}

export function hasProfile(id: string) {
  return listProfiles().some((profile) => profile.id === id)
}

export function getProfile(id: string): DocumentProfile {
  const file = `${id}.profile.json`
  if (!existsSync(resolve(profileDirectory(), file)))
    throw new Error(`Direction profile "${id}" was not found.`)
  const profile = documentProfileSchema.parse(readProfileFile(file))
  if (profile.id !== id) throw new Error(`Profile id "${profile.id}" must match filename "${id}".`)
  return profile
}

export function getCandidateProfile(): CandidateProfile {
  if (process.env.CANDIDATE_PROFILE_JSON) {
    try {
      return candidateProfileSchema.parse(JSON.parse(process.env.CANDIDATE_PROFILE_JSON))
    } catch {
      throw new Error('CANDIDATE_PROFILE_JSON is not a valid candidate profile.')
    }
  }
  const configuredPath = process.env.CANDIDATE_PROFILE_FILE
  const path = configuredPath ?? resolve(profileDirectory(), 'candidate.profile.json')
  if (!existsSync(path))
    throw new Error(
      'Candidate profile is missing. Create profiles/candidate.profile.json locally, or set the CANDIDATE_PROFILE_JSON secret in production.',
    )
  return candidateProfileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}

export function resolveProjectAsset(relativePath: string) {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), '..', relativePath),
  ]
  const path = candidates.find(existsSync)
  if (!path) throw new Error(`Project asset "${relativePath}" was not found.`)
  return path
}
