import { resolve } from 'node:path'
import { loadCareerData } from '../../src/lib/career-data'

/**
 * Loads the checked-in example career data deterministically, ignoring any
 * private `career-data/` directory on the developer machine. Tests must never
 * read the user's private career data.
 */
export function loadExampleCareerData() {
  const previousData = process.env.CAREER_DATA_DIR
  process.env.CAREER_DATA_DIR = resolve(process.cwd(), 'career-data.example')
  try {
    return loadCareerData()
  } finally {
    if (previousData === undefined) delete process.env.CAREER_DATA_DIR
    else process.env.CAREER_DATA_DIR = previousData
  }
}
