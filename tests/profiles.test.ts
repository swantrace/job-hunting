import { describe, expect, test } from 'bun:test'
import { listProfiles } from '../src/lib/profiles'

describe('profiles', () => {
  test('uses profile filenames as stable direction ids', () => {
    expect(
      listProfiles()
        .map((profile) => profile.id)
        .sort(),
    ).toEqual(['fhir', 'frontend', 'fullstack'])
  })
})
