import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listCareerDirections } from '../db/career-directions'
import { db } from '../db/client'
import type { DbExecutor } from '../db/skill-queries'
import {
  buildChatGptContextJson,
  chatGptContextFormat,
  serializeChatGptContext,
} from '../lib/career/chatgpt-context'

type Options = {
  directionIds: string[]
  outputDirectory: string
  /** Opt-in: private publication source URLs and project URLs stay excluded by default. */
  includeSourceUrls: boolean
}

function usage() {
  return `Usage: bun run career:export-chatgpt-context -- [options]

Exports one versioned JSON ChatGPT context per career direction (${chatGptContextFormat}).
Each file combines the direction's approved Base Resume with the safe career facts
stored in SQLite and the direction's effective editing rules. Only the direction
key is used in the file name, so no fact or contact detail is written to disk.

Options:
  --direction <key>      Export one direction; repeat to select more than one
  --output <dir>         Output directory (default: ./chatgpt-context)
  --include-source-urls  Include private publication source URLs and project URLs
                         (excluded from the generated context by default)
  --help                 Show help

The generator never reads the legacy career-data directory and never calls
ChatGPT. Contact details stay out of the export unless the UI explicitly opts in.`
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
  let includeSourceUrls = false

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    if (option === '--help' || option === '-h') return null
    if (option === '--include-source-urls') {
      includeSourceUrls = true
      continue
    }
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
    outputDirectory:
      outputDirectory || resolve(env.CHATGPT_CONTEXT_DIR?.trim() || '.', 'chatgpt-context'),
    includeSourceUrls,
  }
}

/** One JSON context, direction-scoped, built from the database. */
function contextFor(executor: DbExecutor, directionKey: string, includeSourceUrls: boolean) {
  return serializeChatGptContext(
    buildChatGptContextJson(executor, { directionKey, includeSourceUrls }),
  )
}

/**
 * Exports one JSON context per requested direction. A direction without an
 * approved Base Resume is skipped with a warning instead of failing the whole
 * run, matching the UI preview, which states exactly which directions it omits.
 */
export function exportChatGptCareerContexts(options: Options, executor: DbExecutor = db): string[] {
  const directions = listCareerDirections(executor)
  const known = new Set(directions.map((direction) => direction.key))
  const requested = options.directionIds.length
    ? options.directionIds
    : directions.map((direction) => direction.key)
  for (const id of requested)
    if (!known.has(id)) throw new Error(`Direction "${id}" is not defined in the career database.`)
  const documents: Array<{ fileName: string; json: string }> = []
  for (const directionKey of requested) {
    try {
      documents.push({
        fileName: `${directionKey}.json`,
        json: contextFor(executor, directionKey, options.includeSourceUrls),
      })
    } catch (error) {
      console.warn(error instanceof Error ? error.message : error)
    }
  }
  if (documents.length === 0) {
    throw new Error('No requested direction has an approved Base Resume, so nothing was exported.')
  }

  mkdirSync(options.outputDirectory, { recursive: true })
  return documents.map(({ fileName, json }) => {
    const destination = resolve(options.outputDirectory, fileName)
    const temporary = `${destination}.tmp-${process.pid}`
    try {
      writeFileSync(temporary, json)
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
