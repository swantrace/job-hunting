import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { type CanonicalCareerData, loadCareerData } from '../../src/lib/career-data'

/**
 * Loads the checked-in example career data deterministically, ignoring any
 * private `career-data/` directory on the developer machine. Tests must never
 * read the user's private career data.
 */
export function loadExampleCareerData() {
  return withCareerDataDirectory(resolve(process.cwd(), 'career-data.example'), () =>
    loadCareerData(),
  )
}

/**
 * Runs `run` with `CAREER_DATA_DIR` pointed at `directory`, restoring the
 * previous value afterwards so one test cannot leak its data directory into the
 * next.
 */
export function withCareerDataDirectory<T>(directory: string, run: (directory: string) => T): T {
  const previousData = process.env.CAREER_DATA_DIR
  process.env.CAREER_DATA_DIR = directory
  try {
    return run(directory)
  } finally {
    if (previousData === undefined) delete process.env.CAREER_DATA_DIR
    else process.env.CAREER_DATA_DIR = previousData
  }
}

/**
 * Creates a temporary career-data directory outside the repository, writes files
 * into it with `populate`, then loads the validated canonical data from that
 * directory. The directory is always removed afterwards.
 */
export function loadCareerDataFrom(populate: (directory: string) => void): CanonicalCareerData {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-career-data-'))
  try {
    populate(root)
    return withCareerDataDirectory(root, () => loadCareerData())
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}
