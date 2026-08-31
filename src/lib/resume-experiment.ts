import { createHash } from 'node:crypto'
import type { CanonicalCareerData } from './career-data'

export const resumeExperimentMethods = [
  'base-minimal',
  'base-grounded',
  'career-grounded',
  'base-constrained',
  'baseline-minimal',
  'baseline-grounded',
  'baseline-career-only',
] as const

export const jdResumeExperimentMethods = resumeExperimentMethods.filter(
  (method) => !method.startsWith('baseline-'),
)

export type ResumeExperimentMethod = (typeof resumeExperimentMethods)[number]

export type ResumeExperimentInput = {
  jd?: string
  baseResume: string
  careerContext: string
  originalPrompt: string
}

export type ResumeExperimentRequest = {
  method: ResumeExperimentMethod
  instructions: string
  input: string
}

export type ResponsePayload = {
  id?: string
  model?: string
  output_text?: string
  output?: Array<{
    type?: string
    content?: Array<{ type?: string; text?: string }>
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

const markdownRequirement = `Return only the complete tailored resume in Markdown. Do not return analysis, advice, a cover letter, a change log, or fenced code. Use clear resume section headings and bullets. Aim for content that can fit a polished two-page resume.`

const qualityGoal = `Produce the strongest truthful resume for this exact role. Match the job's exact target title, prioritize its most important requirements, use specific supported technologies and outcomes, preserve a readable reverse-chronological career history, and give relevant projects substantive bullets. Avoid generic filler and unnecessary weakening language when the supplied material supports a stronger claim.`

const factualBoundary = `Canonical career data is the authoritative factual boundary. The base resume is an editorial starting point, not an independent source of truth. Do not invent or enlarge employers, roles, dates, metrics, technologies, project maturity, customers, leadership, or outcomes. Resolve conflicts in favor of canonical career data. A missing fact is not permission to infer it.`

const constrainedRules = `Treat the supplied material as a strict factual boundary. Prefer omission over any uncertain statement. Do not generalize a technology, contribution, result, responsibility, or skill beyond its exact supporting wording. Do not turn personal projects into production experience, imply people management, or add a keyword solely because it appears in the job description.`

function section(label: string, content: string) {
  return `## ${label}\n\n${content.trim()}`
}

export function buildResumeExperimentRequest(
  method: ResumeExperimentMethod,
  values: ResumeExperimentInput,
): ResumeExperimentRequest {
  const jd = values.jd?.trim() ? section('Job description', values.jd) : null
  const baseResume = section('Base resume', values.baseResume)
  const careerContext = section('Canonical career data', values.careerContext)

  if (method === 'baseline-minimal')
    return {
      method,
      instructions: `You are an expert technical resume editor specializing in healthcare interoperability. ${markdownRequirement}`,
      input: [
        section(
          'Goal',
          'Create a strong general-purpose baseline resume for FHIR Software Engineer, Healthcare Interoperability Engineer, and FHIR-focused Full-Stack Engineer opportunities. There is no job description or specific employer. Do not invent one or claim alignment with one.',
        ),
        baseResume,
        'Edit the base resume for broad FHIR-market positioning. Preserve its strongest structure and wording where appropriate, improve clarity and information density, and return a reusable baseline that can later be tailored to a specific job.',
      ].join('\n\n'),
    }

  if (method === 'baseline-grounded')
    return {
      method,
      instructions: `You are an expert technical resume editor specializing in healthcare interoperability. ${qualityGoal} ${factualBoundary} ${markdownRequirement}`,
      input: [
        section(
          'Goal',
          'Create a strong general-purpose baseline resume for FHIR Software Engineer, Healthcare Interoperability Engineer, and FHIR-focused Full-Stack Engineer opportunities. There is no job description or specific employer. Do not invent one or claim alignment with one.',
        ),
        baseResume,
        careerContext,
        'Edit the base resume rather than rebuilding the candidate narrative from scratch. Preserve its strongest editorial structure, correct conflicts from canonical career data, remove unsupported claims, and improve selection, clarity, information density, and broad FHIR-market positioning. Return a reusable baseline that can later be tailored to a specific job.',
      ].join('\n\n'),
    }

  if (method === 'baseline-career-only')
    return {
      method,
      instructions: `You are an expert technical resume writer specializing in healthcare interoperability. ${qualityGoal} Canonical career data is the complete factual boundary. ${markdownRequirement}`,
      input: [
        section(
          'Goal',
          'Create a strong general-purpose baseline resume for FHIR Software Engineer, Healthcare Interoperability Engineer, and FHIR-focused Full-Stack Engineer opportunities. There is no job description or specific employer. Do not invent one or claim alignment with one.',
        ),
        careerContext,
        'Create the complete reusable baseline directly from canonical career data. Select the strongest FHIR evidence, preserve a readable reverse-chronological history, and include only projects and claims supported by the supplied data.',
      ].join('\n\n'),
    }

  if (!jd) throw new Error(`Experiment method "${method}" requires a job description.`)

  if (method === 'base-minimal')
    return {
      method,
      instructions: `You are an expert resume editor. ${markdownRequirement}`,
      input: [
        section('User request', values.originalPrompt),
        jd,
        baseResume,
        'Revise the base resume for this job and return the complete tailored resume.',
      ].join('\n\n'),
    }

  if (method === 'base-grounded')
    return {
      method,
      instructions: `You are an expert technical resume editor. ${qualityGoal} ${factualBoundary} ${markdownRequirement}`,
      input: [
        section('User request', values.originalPrompt),
        jd,
        baseResume,
        careerContext,
        'Edit the base resume rather than rebuilding the candidate narrative from scratch. Re-select and rewrite content where the job warrants it.',
      ].join('\n\n'),
    }

  if (method === 'career-grounded')
    return {
      method,
      instructions: `You are an expert technical resume writer. ${qualityGoal} Canonical career data is the complete factual boundary. ${markdownRequirement}`,
      input: [
        section('User request', values.originalPrompt),
        jd,
        careerContext,
        'Create the complete tailored resume directly from the canonical career data. There is no base resume.',
      ].join('\n\n'),
    }

  return {
    method,
    instructions: `You are a conservative technical resume editor. ${factualBoundary} ${constrainedRules} ${markdownRequirement}`,
    input: [
      section('User request', values.originalPrompt),
      jd,
      baseResume,
      careerContext,
      'Edit the base resume for the job while applying every constraint above.',
    ].join('\n\n'),
  }
}

export function canonicalCareerContext(data: CanonicalCareerData, direction: string) {
  const profile = data.profiles.find((item) => item.id === direction)
  if (!profile) throw new Error(`No career profile exists for direction "${direction}".`)
  return JSON.stringify(
    {
      candidate: data.candidate,
      experiences: data.experiences,
      achievements: {
        ...data.achievements,
        achievements: data.achievements.achievements.filter((item) => item.safeToUse),
      },
      publications: {
        ...data.publications,
        publications: data.publications.publications.filter((item) => item.safeToUse),
      },
      projects: data.projects,
      skills: data.skills,
      stories: data.stories,
      preferences: data.preferences,
      profile,
    },
    null,
    2,
  )
}

export function responseText(payload: ResponsePayload) {
  const shortcut = payload.output_text?.trim()
  if (shortcut) return shortcut
  const text = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' || item.type === undefined)
    .flatMap((item) => (item.text ? [item.text.trim()] : []))
    .filter(Boolean)
    .join('\n\n')
  if (!text) throw new Error('OpenAI returned no text output.')
  return text
}

export function stripMarkdownFence(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i)
  return (match?.[1] ?? trimmed).trim()
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function basicResumeMetrics(markdown: string) {
  const words = markdown.match(/[\p{L}\p{N}][\p{L}\p{N}.+#/-]*/gu) ?? []
  const lines = markdown.split(/\r?\n/)
  return {
    characters: markdown.length,
    words: words.length,
    headings: lines.filter((line) => /^#{1,6}\s/.test(line)).length,
    bullets: lines.filter((line) => /^\s*[-*+]\s+/.test(line)).length,
  }
}
