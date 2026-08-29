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
import {
  getBaselineGenerationEvidenceSnapshot,
  getBaselineGenerationRun,
  getGenerationEvidenceSnapshot,
  getGenerationSource,
  saveGenerationRunResults,
} from '../db/generation'
import { getArtifactsRoot } from './artifact-storage'
import { todayISO } from './date'
import type {
  BaselineEvidenceSelectionSnapshot,
  EvidenceSelectionSnapshot,
} from './evidence-selection'
import {
  assertGenerationEvidenceReferences,
  buildGenerationEvidenceAllowlist,
} from './generation-provenance'
import { resolveProjectAsset } from './profiles'
import { generationEligibleRequirements } from './skills/generation-eligibility'

type JsonSchema = Record<string, unknown>
type ArtifactOutput = {
  type: 'job_context' | 'resume' | 'cover_letter'
  fileName: string
  filePath: string
  mimeType: string
}
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
  if (!response.ok)
    throw new Error(
      `OpenAI generation request failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
    )
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
function allowed(label: string, ids: string[], allowedIds: string[]) {
  for (const id of ids)
    if (!allowedIds.includes(id))
      throw new Error(`${label} selected an unsupported evidence ID "${id}".`)
}

function skillGroups(skills: Array<{ label: string; items: string | string[] }>) {
  return skills.map((skill) => ({
    label: skill.label,
    items: Array.isArray(skill.items) ? skill.items.join(', ') : skill.items,
  }))
}

export function recipientName(salutation: string) {
  return (
    salutation
      .replace(/^dear\s+/i, '')
      .replace(/[,:;.!]+$/g, '')
      .trim() || 'Hiring Team'
  )
}

export async function generateApplicationArtifacts(runId: number): Promise<ArtifactOutput[]> {
  const source = getGenerationSource(runId)
  const saved = getGenerationEvidenceSnapshot(runId)
  if (!source || !saved) throw new Error('Generation evidence snapshot is missing.')
  if (!source.jobPosting || !source.analysis)
    throw new Error('Parse the job post with AI before generating application documents.')
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  const snapshot = JSON.parse(saved.snapshotJson) as EvidenceSelectionSnapshot
  const facts = snapshot.facts as any
  const requirements = snapshot.skillRequirements ?? []
  const includedRequirements = generationEligibleRequirements(requirements)
  const jobContext = {
    version: 2,
    generatedAt: todayISO(),
    application: {
      id: source.application.id,
      direction: source.application.direction,
      jobTitle: source.application.jobTitle,
      company: source.company.name,
      location: source.application.location,
      postedDate: source.application.postedDate,
      salary: source.application.salary,
      skills: includedRequirements.map((requirement) => requirement.skillName),
      skillProvenance: includedRequirements.map((requirement) => ({
        skill: requirement.skillName,
        source:
          requirement.analysisResult === 'proven-match' ? 'career-evidence' : 'application-only',
        reason: requirement.analysisResult === 'proven-match' ? null : requirement.decisionReason,
      })),
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
    evidenceSelection: snapshot.selection,
  }
  const aiInput = { jobContext, evidenceSnapshot: snapshot }
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
  allowed(
    'Resume experience',
    resume.experienceBullets.map((item) => item.id),
    snapshot.selection.experienceIds,
  )
  allowed('Resume project', resume.selectedProjectIds, snapshot.selection.projectIds)
  const evidenceAllowlist = buildGenerationEvidenceAllowlist(snapshot)
  assertGenerationEvidenceReferences(resume.summary.evidenceRefs, evidenceAllowlist)
  for (const item of resume.experienceBullets)
    for (const bullet of item.bullets)
      assertGenerationEvidenceReferences(bullet.evidenceRefs, evidenceAllowlist)
  for (const paragraph of coverLetter.evidenceParagraphs)
    assertGenerationEvidenceReferences(paragraph.evidenceRefs, evidenceAllowlist)
  // Persist the reviewable structured results before rendering so a DOCX
  // write/upload failure cannot leave a falsely completed run.
  saveGenerationRunResults(runId, {
    resumeJson: JSON.stringify(resume),
    coverLetterJson: JSON.stringify(coverLetter),
    atsAuditJson: null,
  })
  const bullets = new Map(resume.experienceBullets.map((item) => [item.id, item.bullets]))
  const selectedProjects = resume.selectedProjectIds
    .map((id) => facts.projects.find((item: any) => item.id === id))
    .filter(Boolean)
  const publications = (facts.publications ?? []).map((item: any) => ({
    citation: item.citation,
    contribution: item.contributions.length
      ? `Contributions: ${item.contributions.join('; ')}`
      : '',
  }))
  const identity = facts.candidate.identity
  const resumeData = {
    candidateName: identity.fullName,
    location: `${facts.candidate.location.city}, ${facts.candidate.location.province}`,
    phone: identity.phone,
    email: identity.email,
    linkedin: identity.linkedin,
    github: identity.github,
    portfolio: identity.portfolio,
    targetTitle: resume.targetTitle,
    summary: resume.summary.text,
    skills: skillGroups(resume.skills),
    experiences: facts.experiences.map((item: any) => ({
      role: item.role,
      company: item.company,
      displayDates: item.displayDates,
      bullets: (bullets.get(item.id) ?? []).map((bullet) => ({ text: bullet.text })),
    })),
    showSelectedProjects: selectedProjects.length > 0,
    selectedProjects: selectedProjects.map((item: any) => ({
      name: item.name,
      technologies: item.skills.join(', '),
      description: item.safeClaims?.[0] ?? '',
    })),
    showPublications: publications.length > 0,
    publications,
    education: facts.candidate.education.map((item: any) => ({
      ...item,
      graduationYear: item.graduationYear ?? '',
    })),
  }
  const coverLetterData = {
    candidateName: identity.fullName,
    location: `${facts.candidate.location.city}, ${facts.candidate.location.province}`,
    phone: identity.phone,
    email: identity.email,
    linkedin: identity.linkedin,
    github: identity.github,
    portfolio: identity.portfolio,
    date: todayISO(),
    hasHiringManager: false,
    hiringManagerName: '',
    hiringManagerTitle: '',
    company: source.company.name,
    companyLocation: source.application.location ?? '',
    targetRole: resume.targetTitle,
    jobPostingReference: source.application.jobTitle,
    salutation: recipientName(coverLetter.salutation),
    openingParagraph: coverLetter.openingParagraph,
    evidenceParagraphs: coverLetter.evidenceParagraphs.map((paragraph) => ({
      text: paragraph.text,
    })),
    companyInterestParagraph: coverLetter.companyInterestParagraph,
    includeAuthorization: coverLetter.includeAuthorization,
    authorizationParagraph: coverLetter.authorizationParagraph,
    closingParagraph: coverLetter.closingParagraph,
  }
  const root = getArtifactsRoot(),
    relativeDirectory = `run-${runId}`,
    directory = resolve(root, relativeDirectory),
    baseName = `${filenamePart(source.company.name)}-${filenamePart(source.application.jobTitle)}`
  await mkdir(directory, { recursive: true })
  const contextFileName = `${baseName}-job-context.json`,
    resumeFileName = `${baseName}-resume.docx`,
    coverLetterFileName = `${baseName}-cover-letter.docx`
  await writeFile(resolve(directory, contextFileName), JSON.stringify(jobContext, null, 2))
  await writeFile(
    resolve(directory, resumeFileName),
    await renderDocx(resolveProjectAsset('templates/resume.template.docx'), resumeData),
  )
  await writeFile(
    resolve(directory, coverLetterFileName),
    await renderDocx(resolveProjectAsset('templates/cover-letter.template.docx'), coverLetterData),
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

export async function generateBaselineResume(runId: number) {
  const run = getBaselineGenerationRun(runId)
  const saved = getBaselineGenerationEvidenceSnapshot(runId)
  if (!run || !saved) throw new Error('Baseline evidence snapshot is missing.')
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  const snapshot = JSON.parse(saved.snapshotJson) as BaselineEvidenceSelectionSnapshot
  const facts = snapshot.facts as any
  const resume = await structuredOutput({
    apiKey,
    model: process.env.OPENAI_MODEL_RESUME ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini',
    name: 'baseline_resume',
    system: `${resumeGenerationSystemPrompt}\n- This is a direction baseline, not a specific job application. Do not mention an employer, job posting, or requirements that were not supplied.`,
    schema: tailoredResumeResponseSchema,
    input: {
      baseline: {
        direction: run.direction,
        targetTitle: run.targetTitle,
        targetKeywords: snapshot.baseline.targetKeywords,
      },
      evidenceSnapshot: snapshot,
    },
    parse: (value) => tailoredResumeSchema.parse(value),
  })
  allowed(
    'Resume experience',
    resume.experienceBullets.map((item) => item.id),
    snapshot.selection.experienceIds,
  )
  allowed('Resume project', resume.selectedProjectIds, snapshot.selection.projectIds)
  const evidenceAllowlist = buildGenerationEvidenceAllowlist(snapshot)
  assertGenerationEvidenceReferences(resume.summary.evidenceRefs, evidenceAllowlist)
  for (const item of resume.experienceBullets)
    for (const bullet of item.bullets)
      assertGenerationEvidenceReferences(bullet.evidenceRefs, evidenceAllowlist)
  const bullets = new Map(resume.experienceBullets.map((item) => [item.id, item.bullets]))
  const identity = facts.candidate.identity
  const resumeData = {
    candidateName: identity.fullName,
    location: `${facts.candidate.location.city}, ${facts.candidate.location.province}`,
    phone: identity.phone,
    email: identity.email,
    linkedin: identity.linkedin,
    github: identity.github,
    portfolio: identity.portfolio,
    targetTitle: resume.targetTitle || run.targetTitle,
    summary: resume.summary.text,
    skills: skillGroups(resume.skills),
    experiences: facts.experiences.map((item: any) => ({
      role: item.role,
      company: item.company,
      displayDates: item.displayDates,
      bullets: (bullets.get(item.id) ?? []).map((bullet) => ({ text: bullet.text })),
    })),
    showSelectedProjects: resume.selectedProjectIds.length > 0,
    selectedProjects: resume.selectedProjectIds
      .map((id) => facts.projects.find((item: any) => item.id === id))
      .filter(Boolean)
      .map((item: any) => ({
        name: item.name,
        technologies: item.skills.join(', '),
        description: item.safeClaims?.[0] ?? '',
      })),
    showPublications: (facts.publications ?? []).length > 0,
    publications: (facts.publications ?? []).map((item: any) => ({
      citation: item.citation,
      contribution: item.contributions.length
        ? `Contributions: ${item.contributions.join('; ')}`
        : '',
    })),
    education: facts.candidate.education.map((item: any) => ({
      ...item,
      graduationYear: item.graduationYear ?? '',
    })),
  }
  const root = getArtifactsRoot()
  const relativeDirectory = `baseline-run-${runId}`
  const fileName = `${filenamePart(run.direction)}-${filenamePart(run.targetTitle)}-baseline-resume.docx`
  await mkdir(resolve(root, relativeDirectory), { recursive: true })
  await writeFile(
    resolve(root, relativeDirectory, fileName),
    await renderDocx(resolveProjectAsset('templates/resume.template.docx'), resumeData),
  )
  return {
    fileName,
    filePath: `${relativeDirectory}/${fileName}`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
}
