import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { loadCareerData } from '../lib/career-data'
import {
  basicResumeMetrics,
  buildResumeExperimentRequest,
  canonicalCareerContext,
  jdResumeExperimentMethods,
  type ResponsePayload,
  type ResumeExperimentMethod,
  responseText,
  resumeExperimentMethods,
  sha256,
  stripMarkdownFence,
} from '../lib/resume-experiment'

const projectRoot = resolve(import.meta.dir, '../..')
const defaultOriginalPrompt =
  'Do you think I’m a good fit for this role? How should I tailor my résumé, and should I mention my AI-powered English Speaking Coach and job-hunting projects?'
const defaultBaselinePrompt =
  'Create a reusable FHIR baseline resume from the approved base resume and canonical career data.'

type Options = {
  jdPath?: string
  baseResumePath: string
  direction: string
  methods: ResumeExperimentMethod[]
  model: string
  name: string
  outputRoot: string
  originalPrompt: string
  dryRun: boolean
}

function usage() {
  return `Usage: bun run resume:experiment -- [options]

Required:
  --base-resume <path>         Base resume as PDF, Markdown, or text

Options:
  --jd <path>                  Job description text file. When omitted, runs the
                               the three baseline methods only.
  --direction <id>             Career profile direction (default: fullstack)
  --methods <csv>              Methods to run (default: all)
                               ${resumeExperimentMethods.join(', ')}
  --model <id>                 Model (default: RESUME_EXPERIMENT_MODEL,
                               OPENAI_MODEL_RESUME, OPENAI_MODEL_DEFAULT)
  --name <name>                Safe output directory name
  --output <directory>         Output root (default: .resume-experiments)
  --prompt <text>              Original user prompt
  --dry-run                    Build private request/manifests without API calls
  --help                       Show help
`
}

function requiredValue(args: string[], index: number, option: string) {
  const value = args[index + 1]?.trim()
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`)
  return value
}

export function parseOptions(args: string[]): Options {
  let jdPath = ''
  let baseResumePath = ''
  let direction = 'fullstack'
  let methods: ResumeExperimentMethod[] = [...jdResumeExperimentMethods]
  let methodsWereSpecified = false
  let model =
    process.env.RESUME_EXPERIMENT_MODEL?.trim() ||
    process.env.OPENAI_MODEL_RESUME?.trim() ||
    process.env.OPENAI_MODEL_DEFAULT?.trim() ||
    'gpt-5.6-sol'
  let name = `resume-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`
  let outputRoot = resolve(projectRoot, '.resume-experiments')
  let originalPrompt = defaultOriginalPrompt
  let dryRun = false

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    if (option === '--help' || option === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (option === '--dry-run') {
      dryRun = true
      continue
    }
    const value = requiredValue(args, index, option)
    index += 1
    if (option === '--jd') jdPath = resolve(projectRoot, value)
    else if (option === '--base-resume') baseResumePath = resolve(projectRoot, value)
    else if (option === '--direction') direction = value
    else if (option === '--model') model = value
    else if (option === '--name') name = value
    else if (option === '--output') outputRoot = resolve(projectRoot, value)
    else if (option === '--prompt') originalPrompt = value
    else if (option === '--methods') {
      methodsWereSpecified = true
      const requested = value.split(',').map((item) => item.trim())
      const invalid = requested.filter(
        (item): item is string => !resumeExperimentMethods.includes(item as ResumeExperimentMethod),
      )
      if (invalid.length) throw new Error(`Unknown experiment method(s): ${invalid.join(', ')}`)
      methods = requested as ResumeExperimentMethod[]
    } else throw new Error(`Unknown option: ${option}`)
  }

  if (!baseResumePath) throw new Error('--base-resume is required.')
  if (jdPath && !existsSync(jdPath)) throw new Error(`JD file does not exist: ${jdPath}`)
  if (!existsSync(baseResumePath)) throw new Error(`Base resume does not exist: ${baseResumePath}`)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(direction))
    throw new Error(`Invalid direction: ${direction}`)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model)) throw new Error(`Invalid model: ${model}`)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new Error(`Invalid name: ${name}`)
  if (new Set(methods).size !== methods.length)
    throw new Error('Methods must not contain duplicates.')
  if (!jdPath) {
    if (!methodsWereSpecified)
      methods = ['baseline-minimal', 'baseline-grounded', 'baseline-career-only']
    else if (methods.some((method) => !method.startsWith('baseline-')))
      throw new Error('A job description is required for every non-baseline method.')
    if (originalPrompt === defaultOriginalPrompt) originalPrompt = defaultBaselinePrompt
  }
  return {
    jdPath: jdPath || undefined,
    baseResumePath,
    direction,
    methods,
    model,
    name,
    outputRoot,
    originalPrompt,
    dryRun,
  }
}

async function pdfText(path: string) {
  const child = Bun.spawn(
    ['gs', '-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=txtwrite', '-sOutputFile=-', path],
    { cwd: projectRoot, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0) throw new Error(stderr.trim() || `Unable to extract PDF text from ${path}.`)
  return stdout.trim()
}

export async function readExperimentDocument(path: string) {
  if (extname(path).toLowerCase() === '.pdf') return pdfText(path)
  return readFileSync(path, 'utf8').trim()
}

async function createResponse(apiKey: string, model: string, instructions: string, input: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort: 'medium' },
      max_output_tokens: 10_000,
      store: false,
    }),
  })
  if (!response.ok)
    throw new Error(
      `OpenAI experiment request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`,
    )
  return (await response.json()) as ResponsePayload
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args)
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!options.dryRun && !apiKey)
    throw new Error('OPENAI_API_KEY is required for a live experiment.')

  const [jd, baseResume] = await Promise.all([
    options.jdPath ? readExperimentDocument(options.jdPath) : Promise.resolve(''),
    readExperimentDocument(options.baseResumePath),
  ])
  const careerContext = canonicalCareerContext(loadCareerData(), options.direction)
  const outputDirectory = resolve(options.outputRoot, options.name)
  if (existsSync(outputDirectory)) throw new Error(`Output already exists: ${outputDirectory}`)
  mkdirSync(outputDirectory, { recursive: true })

  const startedAt = new Date().toISOString()
  const methods = []
  for (const method of options.methods) {
    const request = buildResumeExperimentRequest(method, {
      jd,
      baseResume,
      careerContext,
      originalPrompt: options.originalPrompt,
    })
    writeFileSync(
      resolve(outputDirectory, `${method}.request.json`),
      JSON.stringify(request, null, 2),
    )
    const methodStart = performance.now()
    console.log(`${options.dryRun ? 'Preparing' : 'Running'} ${method}...`)
    if (options.dryRun) {
      methods.push({
        method,
        requestHash: sha256(JSON.stringify(request)),
        status: 'dry-run',
      })
      continue
    }
    const payload = await createResponse(
      apiKey as string,
      options.model,
      request.instructions,
      request.input,
    )
    const markdown = stripMarkdownFence(responseText(payload))
    writeFileSync(resolve(outputDirectory, `${method}.md`), `${markdown}\n`)
    methods.push({
      method,
      requestHash: sha256(JSON.stringify(request)),
      responseId: payload.id ?? null,
      responseModel: payload.model ?? options.model,
      elapsedMs: Math.round(performance.now() - methodStart),
      usage: payload.usage ?? null,
      metrics: basicResumeMetrics(markdown),
      status: 'completed',
    })
    writeFileSync(
      resolve(outputDirectory, 'manifest.partial.json'),
      JSON.stringify({ methods }, null, 2),
    )
  }

  const manifest = {
    version: 1,
    name: options.name,
    startedAt,
    completedAt: new Date().toISOString(),
    model: options.model,
    direction: options.direction,
    dryRun: options.dryRun,
    inputs: {
      jdHash: jd ? sha256(jd) : null,
      baseResumeHash: sha256(baseResume),
      careerContextHash: sha256(careerContext),
      originalPrompt: options.originalPrompt,
    },
    methods,
  }
  writeFileSync(resolve(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`Experiment saved to ${outputDirectory}`)
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
