import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  baseResumesDirectory,
  frozenBaseResumeSource,
  loadApprovedBaseResume,
} from '../lib/base-resumes'
import { careerDataDirectory, loadCareerData } from '../lib/career-data'
import { buildChatGptCareerContext } from '../lib/chatgpt-career-context'

type Options = {
  directionIds: string[]
  outputDirectory: string
}

function usage() {
  return `Usage: bun run career:export-chatgpt-context -- [options]

Exports one self-contained Markdown context per career direction. Each file
combines the direction's approved Base Resume with safe canonical Career Data
for use in ChatGPT or another interactive LLM workspace.

Options:
  --direction <id>  Export one direction; repeat to select more than one
  --output <dir>    Output directory (default: <CAREER_DATA_DIR>/chatgpt-context)
  --help            Show help
`
}

function requiredValue(args: string[], index: number, option: string) {
  const value = args[index + 1]?.trim()
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`)
  return value
}

export function parseChatGptContextOptions(
  args: string[],
  env: Record<string, string | undefined> = process.env,
): Options | null {
  const directionIds: string[] = []
  let outputDirectory = ''

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    if (option === '--help' || option === '-h') return null
    const value = requiredValue(args, index, option)
    index += 1
    if (option === '--direction') directionIds.push(value)
    else if (option === '--output') outputDirectory = resolve(value)
    else throw new Error(`Unknown option: ${option}`)
  }

  for (const id of directionIds)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid direction: ${id}`)

  return {
    directionIds: [...new Set(directionIds)],
    outputDirectory: outputDirectory || resolve(careerDataDirectory(env), 'chatgpt-context'),
  }
}

export function exportChatGptCareerContexts(options: Options): string[] {
  const careerData = loadCareerData()
  const directions = Object.entries(careerData.preferences.directionDefinitions)
    .map(([id, definition]) => ({ id, ...definition }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const knownIds = new Set(directions.map((direction) => direction.id))
  const requested = options.directionIds.length
    ? options.directionIds.map((id) => {
        const direction = directions.find((candidate) => candidate.id === id)
        if (!direction)
          throw new Error(`Direction "${id}" is not defined in preferences.directionDefinitions.`)
        return direction
      })
    : directions

  const documents = requested.map((direction) => {
    const approved = loadApprovedBaseResume(baseResumesDirectory(), direction.id, knownIds)
    if (!approved)
      throw new Error(`No approved Base Resume exists for direction "${direction.id}".`)
    if (approved.stale)
      throw new Error(
        `Base Resume for direction "${direction.id}" changed after approval. Re-import it before exporting ChatGPT context.`,
      )
    return {
      fileName: `${direction.id}.md`,
      markdown: buildChatGptCareerContext({
        careerData,
        direction,
        baseResume: frozenBaseResumeSource(approved),
      }),
    }
  })

  mkdirSync(options.outputDirectory, { recursive: true })
  return documents.map(({ fileName, markdown }) => {
    const destination = resolve(options.outputDirectory, fileName)
    const temporary = `${destination}.tmp-${process.pid}`
    try {
      writeFileSync(temporary, markdown)
      renameSync(temporary, destination)
    } finally {
      rmSync(temporary, { force: true })
    }
    return destination
  })
}

export function main(args = process.argv.slice(2)) {
  const options = parseChatGptContextOptions(args)
  if (!options) {
    console.log(usage())
    return
  }
  const paths = exportChatGptCareerContexts(options)
  console.log(`Exported ${paths.length} ChatGPT career context file(s):`)
  for (const path of paths) console.log(`- ${path}`)
}

if (import.meta.main)
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
