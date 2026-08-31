import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'

const projectRoot = resolve(import.meta.dir, '../..')
const allowedRoots = ['career-data', 'profiles'] as const

type Options = {
  app: string
  machine?: string
  syncDb: boolean
  selections: string[]
}

type FlyMachine = { id?: string; state?: string }

function usage() {
  return `Usage: bun run fly:sync-career-data -- [options] [selections...]

Selections (default: career-data and profiles):
  career-data                         Upload every JSON file in career-data/
  profiles                            Upload every JSON file in profiles/
  career-data/skills.json             Upload one career-data file
  profiles/fhir.profile.json          Upload one profile

Options:
  --app <name>                         Fly app (default: FLY_APP_NAME or fly.toml)
  --machine <id>                       Target one Machine explicitly
  --sync-db                            Run taxonomy and career-skill DB sync after upload
  --help                               Show this help
`
}

function appFromFlyToml() {
  const path = resolve(projectRoot, 'fly.toml')
  if (!existsSync(path)) return null
  const match = readFileSync(path, 'utf8').match(/^app\s*=\s*["']([^"']+)["']/m)
  return match?.[1] ?? null
}

export function parseOptions(args: string[]): Options {
  const selections: string[] = []
  let app = process.env.FLY_APP_NAME?.trim() || appFromFlyToml() || ''
  let machine: string | undefined
  let syncDb = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--sync-db') {
      syncDb = true
      continue
    }
    if (arg === '--app' || arg === '--machine') {
      const value = args[index + 1]?.trim()
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`)
      if (arg === '--app') app = value
      else machine = value
      index += 1
      continue
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`)
    selections.push(arg)
  }

  if (!app) throw new Error('Fly app is required. Set FLY_APP_NAME or pass --app <name>.')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(app)) throw new Error(`Invalid Fly app name: ${app}`)
  if (machine && !/^[a-zA-Z0-9]+$/.test(machine))
    throw new Error(`Invalid Fly Machine ID: ${machine}`)
  return { app, machine, syncDb, selections }
}

function ensureAllowedPath(path: string, rootDirectory: string) {
  const absolute = resolve(rootDirectory, path)
  const root = allowedRoots.find((candidate) => {
    const absoluteRoot = resolve(rootDirectory, candidate)
    return absolute === absoluteRoot || absolute.startsWith(`${absoluteRoot}${sep}`)
  })
  if (!root) throw new Error(`Selection must be inside career-data/ or profiles/: ${path}`)
  if (!existsSync(absolute)) throw new Error(`Selection does not exist: ${path}`)
  return { absolute, root }
}

function jsonFiles(path: string): string[] {
  if (statSync(path).isFile()) {
    if (!path.endsWith('.json')) throw new Error(`Only JSON files can be synchronized: ${path}`)
    return [path]
  }
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const child = resolve(path, entry.name)
      return entry.isDirectory()
        ? jsonFiles(child)
        : entry.isFile() && child.endsWith('.json')
          ? [child]
          : []
    })
    .sort()
}

export function selectedFiles(selections: string[], rootDirectory = projectRoot) {
  const requested = selections.length ? selections : [...allowedRoots]
  const files = new Set<string>()
  for (const selection of requested) {
    const normalized = selection.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')
    const { absolute } = ensureAllowedPath(normalized, rootDirectory)
    for (const file of jsonFiles(absolute)) files.add(file)
  }
  return [...files].sort()
}

function remotePath(localPath: string, rootDirectory: string) {
  const path = relative(rootDirectory, localPath).split(sep).join('/')
  return `/data/${path}`
}

export function remoteUploadPaths(
  localPath: string,
  uploadId: string,
  rootDirectory = projectRoot,
) {
  if (!/^[a-zA-Z0-9-]+$/.test(uploadId)) throw new Error('Invalid upload ID.')
  const destination = remotePath(localPath, rootDirectory)
  return {
    destination,
    temporary: `${destination}.upload-${uploadId}`,
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function shellCommand(script: string) {
  return `sh -lc ${shellQuote(script)}`
}

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    cwd: projectRoot,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`)
}

async function runCapture(command: string[]) {
  const child = Bun.spawn(command, {
    cwd: projectRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0)
    throw new Error(stderr.trim() || `Command failed (${exitCode}): ${command.join(' ')}`)
  return stdout
}

export function chooseMachine(machines: FlyMachine[]) {
  const ids = machines.flatMap((machine) => (machine.id ? [machine.id] : []))
  if (ids.length === 0) throw new Error('The Fly app has no Machines.')
  if (ids.length > 1)
    throw new Error('The Fly app has multiple Machines. Select one with --machine <id>.')
  return ids[0]
}

async function resolveMachine(options: Options) {
  if (options.machine) return options.machine
  const output = await runCapture(['fly', 'machine', 'list', '--app', options.app, '--json'])
  return chooseMachine(JSON.parse(output) as FlyMachine[])
}

async function ensureMachineStarted(options: Options) {
  if (!options.machine) throw new Error('Fly Machine was not resolved.')
  await run(['fly', 'machine', 'start', options.machine, '--app', options.app])
}

function flyArgs(options: Options) {
  return ['--app', options.app, ...(options.machine ? ['--machine', options.machine] : [])]
}

async function runRemote(options: Options, script: string) {
  await ensureMachineStarted(options)
  await run(['fly', 'ssh', 'console', ...flyArgs(options), '--command', shellCommand(script)])
}

export async function main(args = process.argv.slice(2)) {
  const parsedOptions = parseOptions(args)
  const options = { ...parsedOptions, machine: await resolveMachine(parsedOptions) }
  const files = selectedFiles(options.selections)
  if (!files.length) throw new Error('No JSON files were selected.')

  const uploadId = crypto.randomUUID()
  const uploads = files.map((file) => ({ file, ...remoteUploadPaths(file, uploadId) }))
  const remoteDirectories = [...new Set(uploads.map(({ destination }) => dirname(destination)))]

  console.log(`Uploading ${files.length} file(s) to Fly app "${options.app}"...`)
  console.log(`Using Fly Machine ${options.machine}.`)
  await runRemote(options, `mkdir -p -- ${remoteDirectories.map(shellQuote).join(' ')}`)
  for (const { file, temporary, destination } of uploads) {
    console.log(`${relative(projectRoot, file)} -> ${destination}`)
    await ensureMachineStarted(options)
    await run(['fly', 'sftp', 'put', file, temporary, ...flyArgs(options)])
    await runRemote(options, `mv -f -- ${shellQuote(temporary)} ${shellQuote(destination)}`)
  }

  if (options.syncDb) {
    await runRemote(
      options,
      'cd /app && bun run taxonomy:sync --apply && bun run skills:sync --apply',
    )
  }
  console.log(`Fly career data sync complete (${files.length} file(s)).`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
