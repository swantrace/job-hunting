import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const profileSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
})

export type ProfileOption = z.infer<typeof profileSchema>

function profileDirectory() {
  const candidates = [resolve(process.cwd(), 'profiles'), resolve(process.cwd(), '../profiles')]
  const directory = candidates.find(existsSync)
  if (!directory) throw new Error('Profiles directory was not found.')
  return directory
}

export function listProfiles(): ProfileOption[] {
  const profiles = readdirSync(profileDirectory())
    .filter((file) => file.endsWith('.profile.json'))
    .map((file) => {
      const profile = profileSchema.parse(
        JSON.parse(readFileSync(resolve(profileDirectory(), file), 'utf8')),
      )
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
