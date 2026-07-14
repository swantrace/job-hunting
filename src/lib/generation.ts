import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import {
  applicationGenerationPromptVersion,
  coverLetterGenerationSystemPrompt,
  resumeGenerationSystemPrompt,
} from '../ai/prompts/application-generation'
import {
  tailoredCoverLetterResponseSchema,
  tailoredCoverLetterSchema,
  tailoredResumeResponseSchema,
  tailoredResumeSchema,
} from '../ai/schemas/application-generation'
import { getGenerationSource } from '../db/generation'
import { todayISO } from './date'
import { getCandidateProfile, getProfile, resolveProjectAsset } from './profiles'

type JsonSchema = Record<string, unknown>

type ArtifactOutput = {
  type: 'job_context' | 'resume' | 'cover_letter'
  fileName: string
  filePath: string
  mimeType: string
}

export const getArtifactsRoot = () =>
  process.env.ARTIFACTS_DIR ??
  resolve(process.cwd(), process.cwd().endsWith('/dist') ? '..' : '.', 'artifacts')

const filenamePart = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'application'

async function structuredOutput<T>(args: {
  apiKey: string
  model: string
  name: string
  system: string
  schema: JsonSchema
  input: unknown
  parse: (value: unknown) => T
}) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: args.model,
      input: [
        {
          role: 'system',
          content: `${args.system}\nPrompt version: ${applicationGenerationPromptVersion}`,
        },
        { role: 'user', content: JSON.stringify(args.input) },
      ],
      text: { format: { type: 'json_schema', name: args.name, strict: true, schema: args.schema } },
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI generation request failed (${response.status}): ${body.slice(0, 500)}`)
  }
  const body = (await response.json()) as {
    output_text?: string
    output?: { content?: { text?: string }[] }[]
  }
  const output =
    body.output_text ??
    body.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text
  if (!output) throw new Error('OpenAI returned no generated document content.')
  return args.parse(JSON.parse(output))
}

export function renderDocx(templatePath: string, data: Record<string, unknown>) {
  return readFile(templatePath).then((template) => {
    const document = new Docxtemplater(new PizZip(template), {
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
    })
    document.render(data)
    return document.toBuffer()
  })
}

function splitLines(value: string | null) {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function generateApplicationArtifacts(runId: number): Promise<ArtifactOutput[]> {
  const source = getGenerationSource(runId)
  if (!source) throw new Error('Generation run no longer exists.')
  if (!source.jobPosting || !source.analysis)
    throw new Error('Parse the job post with AI before generating application documents.')
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')

  const candidate = getCandidateProfile()
  const profile = getProfile(source.application.direction)
  const jobContext = {
    version: 1,
    generatedAt: todayISO(),
    application: {
      id: source.application.id,
      direction: source.application.direction,
      jobTitle: source.application.jobTitle,
      company: source.company.name,
      location: source.application.location,
      postedDate: source.application.postedDate,
      salary: source.application.salary,
      skills: source.skills,
    },
    analysis: {
      requirements: splitLines(source.analysis.requirements),
      responsibilities: splitLines(source.analysis.responsibilities),
      painPoints: splitLines(source.analysis.painPoints),
      culture: splitLines(source.analysis.culture),
      redFlags: splitLines(source.analysis.redFlags),
      successMetrics: splitLines(source.analysis.successMetrics),
      benefits: splitLines(source.analysis.benefits),
      notes: source.analysis.notes,
    },
  }
  const aiInput = { jobContext, profile }
  const resume = await structuredOutput({
    apiKey,
    model: process.env.OPENAI_MODEL_RESUME ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini',
    name: 'tailored_resume',
    system: resumeGenerationSystemPrompt,
    schema: tailoredResumeResponseSchema,
    input: aiInput,
    parse: (value) => tailoredResumeSchema.parse(value),
  })
  const coverLetter = await structuredOutput({
    apiKey,
    model:
      process.env.OPENAI_MODEL_COVER_LETTER ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini',
    name: 'tailored_cover_letter',
    system: coverLetterGenerationSystemPrompt,
    schema: tailoredCoverLetterResponseSchema,
    input: aiInput,
    parse: (value) => tailoredCoverLetterSchema.parse(value),
  })

  const updatedBullets = new Map(resume.experienceBullets.map((item) => [item.id, item.bullets]))
  const resumeData = {
    ...candidate,
    targetTitle: resume.targetTitle,
    summary: resume.summary,
    skills: resume.skills,
    experiences: profile.experiences.map((experience) => ({
      role: experience.role,
      company: experience.company,
      displayDates: experience.displayDates,
      bullets: (
        updatedBullets.get(experience.id) ?? experience.bullets.map((bullet) => bullet.text)
      ).map((text) => ({ text })),
    })),
    education: profile.education,
  }
  const coverLetterData = {
    ...candidate,
    date: todayISO(),
    hiringManagerName: '',
    hiringManagerTitle: '',
    company: source.company.name,
    companyLocation: source.application.location ?? '',
    salutation: coverLetter.salutation,
    openingParagraph: coverLetter.openingParagraph,
    evidenceParagraph: coverLetter.evidenceParagraph,
    companyInterestParagraph: coverLetter.companyInterestParagraph,
    closingParagraph: coverLetter.closingParagraph,
  }

  const root = getArtifactsRoot()
  const relativeDirectory = `run-${runId}`
  const directory = resolve(root, relativeDirectory)
  await mkdir(directory, { recursive: true })
  const baseName = `${filenamePart(source.company.name)}-${filenamePart(source.application.jobTitle)}`
  const contextFileName = `${baseName}-job-context.json`
  const resumeFileName = `${baseName}-resume.docx`
  const coverLetterFileName = `${baseName}-cover-letter.docx`
  await writeFile(resolve(directory, contextFileName), JSON.stringify(jobContext, null, 2))
  await writeFile(
    resolve(directory, resumeFileName),
    await renderDocx(resolveProjectAsset(profile.templates.resume), resumeData),
  )
  await writeFile(
    resolve(directory, coverLetterFileName),
    await renderDocx(resolveProjectAsset(profile.templates.coverLetter), coverLetterData),
  )
  return [
    {
      type: 'job_context',
      fileName: contextFileName,
      filePath: `${relativeDirectory}/${contextFileName}`,
      mimeType: 'application/json',
    },
    {
      type: 'resume',
      fileName: resumeFileName,
      filePath: `${relativeDirectory}/${resumeFileName}`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
      type: 'cover_letter',
      fileName: coverLetterFileName,
      filePath: `${relativeDirectory}/${coverLetterFileName}`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  ]
}
