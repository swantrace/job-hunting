import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { approveBaseResume, baseResumesDirectory } from '../lib/base-resumes'
import { todayISO } from '../lib/date'
import { readImportDocument } from '../lib/pdf-text'
import { listProfiles } from '../lib/profiles'

const projectRoot = resolve(import.meta.dir, '../..')

type Options = {
  direction: string
  inputPath: string
  version: string
  outputDirectory: string
}

function usage() {
  return `Usage: bun run resume:import -- [options]

Imports a supplied Base Resume (PDF, Markdown, or text) into the private
approved Base Resume store at career-data/base-resumes/<direction>.md and
updates manifest.json. PDF extraction runs locally via Ghostscript; production
never extracts PDFs.

Required:
  --direction <id>     Career profile direction (e.g. fullstack, fhir)
  --input <path>       PDF, Markdown, or text file

Options:
  --version <label>    Version label (default: the current date)
  --output <dir>       Output directory (default: CAREER_BASE_RESUMES_DIR or
                       career-data/base-resumes)
  --help               Show help
`
}

function requiredValue(args: string[], index: number, option: string) {
  const value = args[index + 1]?.trim()
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`)
  return value
}

export function parseOptions(
  args: string[],
  env: Record<string, string | undefined> = process.env,
) {
  let direction = ''
  let inputPath = ''
  let version = ''
  let outputDirectory = ''

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    if (option === '--help' || option === '-h') {
      console.log(usage())
      process.exit(0)
    }
    const value = requiredValue(args, index, option)
    index += 1
    if (option === '--direction') direction = value
    else if (option === '--input') inputPath = resolve(projectRoot, value)
    else if (option === '--version') version = value
    else if (option === '--output') outputDirectory = resolve(projectRoot, value)
    else throw new Error(`Unknown option: ${option}`)
  }

  if (!direction) throw new Error('--direction is required.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(direction))
    throw new Error(`Invalid direction: ${direction}`)
  if (!inputPath) throw new Error('--input is required.')
  if (!existsSync(inputPath)) throw new Error(`Input file does not exist: ${inputPath}`)
  if (version && version.length > 100) throw new Error('Version label is too long.')
  if (version && /[\r\n]/.test(version)) throw new Error('Version label must be a single line.')
  return {
    direction,
    inputPath,
    version,
    outputDirectory: outputDirectory || baseResumesDirectory(env),
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args)
  const profiles = listProfiles()
  if (!profiles.some((profile) => profile.id === options.direction))
    throw new Error(`Direction "${options.direction}" is not an existing profile.`)
  const text = await readImportDocument(options.inputPath)
  const version = options.version || todayISO()
  const resume = approveBaseResume(options.outputDirectory, options.direction, text, {
    version,
    knownProfileIds: new Set(profiles.map((profile) => profile.id)),
  })
  console.log(
    `Imported Base Resume "${resume.direction}" (${resume.version}) to ${resume.fileName}.`,
  )
  console.log(`Approved sha256: ${resume.approvedSha256}`)
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
