import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  baselineDraftSystemPrompt,
  coverLetterDraftSystemPrompt,
  documentDraftPromptVersion,
  resumeDraftSystemPrompt,
} from '../ai/prompts/document-draft'
import {
  documentMarkdownResponseSchema,
  documentMarkdownSchema,
} from '../ai/schemas/document-draft'
import {
  getBaselineGenerationRun,
  getGenerationSource,
  saveBaselineGenerationEvidenceSnapshot,
  saveBaselineGenerationResults,
  saveGenerationEvidenceSnapshot,
  saveGenerationRunResults,
} from '../db/generation'
import { getArtifactsRoot } from './artifact-storage'
import { todayISO } from './date'
import { type DocumentDraft, parseDocumentDraft } from './document-draft'
import {
  buildBaselineDocumentDraftSnapshot,
  buildDocumentDraftSnapshot,
  type DocumentDraftSnapshot,
} from './document-draft-input'
import { documentDraftPolicy } from './document-draft-policy'
import { extractMetricClaims, validateDocumentDraft } from './document-draft-validation'
import { renderCoverLetterDocx } from './docx/cover-letter-renderer'
import { type DocumentIdentity } from './docx/render-common'
import { renderResumeDocx } from './docx/resume-renderer'
import { docxRendererVersion } from './docx/styles'
import type { GeneratedArtifactType } from './generation/constants'
import { coverLetterModelId, resumeModelId } from './generation-input'
import { stripMarkdownFence } from './resume-experiment'

type ArtifactOutput = {
  type: GeneratedArtifactType
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

async function callMarkdown(args: {
  apiKey: string
  model: string
  system: string
  input: DocumentDraftSnapshot
}): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: args.model,
      input: [
        {
          role: 'system',
          content: `${args.system}\nPrompt version: ${documentDraftPromptVersion}`,
        },
        { role: 'user', content: JSON.stringify(args.input) },
      ],
      text: {
        verbosity: 'medium',
        format: {
          type: 'json_schema',
          name: 'document_markdown',
          strict: true,
          schema: documentMarkdownResponseSchema,
        },
      },
    }),
  })
  if (!response.ok)
    throw new Error(
      `OpenAI document draft request failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
    )
  const body = (await response.json()) as {
    output_text?: string
    output?: { content?: { text?: string }[] }[]
  }
  const output =
    body.output_text ??
    body.output?.flatMap((item) => item.content ?? []).find((part) => part.text)?.text
  if (!output) throw new Error('OpenAI returned no document draft content.')
  const parsed = documentMarkdownSchema.parse(JSON.parse(output))
  return stripMarkdownFence(parsed.markdown)
}

function sectionText(draft: DocumentDraft, sectionId: string): string {
  const section = draft.sections.find((item) => item.id === sectionId)
  return section
    ? section.blocks
        .map((block) => block.text)
        .join(' ')
        .trim()
    : ''
}

function supportedMetrics(snapshot: DocumentDraftSnapshot): string[] {
  return extractMetricClaims(
    `${snapshot.baseResume?.text ?? ''}\n${JSON.stringify(snapshot.careerData)}`,
  )
}

function educationEntries(snapshot: DocumentDraftSnapshot) {
  const candidate = snapshot.careerData.candidate as {
    education?: Array<{
      degree?: string
      school?: string
    }>
  }
  return (candidate.education ?? []).map((item) => ({
    degree: item.degree,
    school: item.school ?? '',
  }))
}

function validateResumeDraft(draft: DocumentDraft, snapshot: DocumentDraftSnapshot) {
  return validateDocumentDraft(draft, {
    education: educationEntries(snapshot),
    supportedMetrics: supportedMetrics(snapshot),
    excludedSkills: snapshot.excludedSkills,
    maxWords: documentDraftPolicy.resume.maxWords,
    maxBullets: documentDraftPolicy.resume.maxBullets,
    sectionContract: {
      required: ['summary', 'skills', 'experience', 'education'],
      order: ['summary', 'skills', 'experience', 'projects', 'publications', 'education'],
    },
    sectionWordBudgets: { summary: documentDraftPolicy.resume.summaryMaxWords },
  })
}

function validateCoverLetterDraft(draft: DocumentDraft, snapshot: DocumentDraftSnapshot) {
  return validateDocumentDraft(draft, {
    salutation: sectionText(draft, 'salutation'),
    maxWords: documentDraftPolicy.coverLetter.maxWords,
    maxBullets: 0,
    supportedMetrics: supportedMetrics(snapshot),
    excludedSkills: snapshot.excludedSkills,
    sectionContract: {
      required: ['salutation', 'opening', 'evidence', 'company-interest', 'closing'],
      order: ['salutation', 'opening', 'evidence', 'company-interest', 'authorization', 'closing'],
    },
    sectionBlockBudgets: {
      evidence: {
        min: documentDraftPolicy.coverLetter.minEvidenceParagraphs,
        max: documentDraftPolicy.coverLetter.maxEvidenceParagraphs,
      },
    },
  })
}

function renderIdentity(snapshot: DocumentDraftSnapshot): DocumentIdentity {
  const candidate = snapshot.careerData.candidate as {
    identity?: Record<string, unknown>
    location?: { city?: string; province?: string }
  }
  const identity = candidate.identity ?? {}
  const location = [candidate.location?.city, candidate.location?.province]
    .filter(Boolean)
    .join(', ')
  return {
    fullName: typeof identity.fullName === 'string' ? identity.fullName : '',
    email: typeof identity.email === 'string' ? identity.email : null,
    phone: typeof identity.phone === 'string' ? identity.phone : null,
    location: location || null,
    linkedin: typeof identity.linkedin === 'string' ? identity.linkedin : null,
    github: typeof identity.github === 'string' ? identity.github : null,
    portfolio: typeof identity.portfolio === 'string' ? identity.portfolio : null,
  }
}

async function writeDraftArtifacts(
  directory: string,
  files: Array<{
    name: string
    content: string | Buffer
    type: GeneratedArtifactType
    mimeType: string
  }>,
): Promise<ArtifactOutput[]> {
  const root = getArtifactsRoot()
  await mkdir(resolve(root, directory), { recursive: true })
  const outputs: ArtifactOutput[] = []
  for (const file of files) {
    const filePath = `${directory}/${file.name}`
    await writeFile(resolve(root, filePath), file.content)
    outputs.push({
      type: file.type,
      fileName: file.name,
      filePath,
      mimeType: file.mimeType,
    })
  }
  return outputs
}

const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function generateApplicationDrafts(runId: number): Promise<ArtifactOutput[]> {
  const source = getGenerationSource(runId)
  if (!source) throw new Error('Generation source no longer exists.')
  const snapshot = buildDocumentDraftSnapshot(source)
  saveGenerationEvidenceSnapshot(runId, JSON.stringify(snapshot, null, 2))

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  const resumeMarkdown = await callMarkdown({
    apiKey,
    model: resumeModelId(),
    system: resumeDraftSystemPrompt,
    input: snapshot,
  })
  const coverLetterMarkdown = await callMarkdown({
    apiKey,
    model: coverLetterModelId(),
    system: coverLetterDraftSystemPrompt,
    input: snapshot,
  })

  const resumeDraft = parseDocumentDraft(resumeMarkdown, 'resume')
  const coverLetterDraft = parseDocumentDraft(coverLetterMarkdown, 'cover-letter')
  const validation = {
    resume: validateResumeDraft(resumeDraft, snapshot),
    coverLetter: validateCoverLetterDraft(coverLetterDraft, snapshot),
  }
  saveGenerationRunResults(runId, {
    resumeJson: null,
    coverLetterJson: null,
    atsAuditJson: null,
    resumeMarkdown,
    coverLetterMarkdown,
    draftValidationJson: JSON.stringify(validation),
    rendererVersion: docxRendererVersion,
  })

  const identity = renderIdentity(snapshot)
  const [resumeDocx, coverLetterDocx] = await Promise.all([
    renderResumeDocx(resumeDraft, { identity, targetTitle: source.application.jobTitle }),
    renderCoverLetterDocx(coverLetterDraft, {
      identity,
      company: source.company.name,
      date: todayISO(),
      targetTitle: source.application.jobTitle,
    }),
  ])

  const baseName = `${filenamePart(source.company.name)}-${filenamePart(source.application.jobTitle)}`
  const directory = `run-${runId}`
  return writeDraftArtifacts(directory, [
    {
      name: `${baseName}-job-context.json`,
      content: `${JSON.stringify(snapshot, null, 2)}\n`,
      type: 'job_context',
      mimeType: 'application/json',
    },
    {
      name: `${baseName}-resume.docx`,
      content: resumeDocx,
      type: 'resume',
      mimeType: docxMimeType,
    },
    {
      name: `${baseName}-cover-letter.docx`,
      content: coverLetterDocx,
      type: 'cover_letter',
      mimeType: docxMimeType,
    },
  ])
}

export async function generateBaselineDraft(runId: number) {
  const run = getBaselineGenerationRun(runId)
  if (!run) throw new Error('Baseline generation run no longer exists.')
  const snapshot = buildBaselineDocumentDraftSnapshot(run)
  saveBaselineGenerationEvidenceSnapshot(runId, JSON.stringify(snapshot, null, 2))

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  const resumeMarkdown = await callMarkdown({
    apiKey,
    model: resumeModelId(),
    system: baselineDraftSystemPrompt,
    input: snapshot,
  })
  const draft = parseDocumentDraft(resumeMarkdown, 'resume')
  const validation = {
    resume: validateResumeDraft(draft, snapshot),
  }
  saveBaselineGenerationResults(runId, {
    resumeMarkdown,
    draftValidationJson: JSON.stringify(validation),
    rendererVersion: docxRendererVersion,
  })

  const identity = renderIdentity(snapshot)
  const resumeDocx = await renderResumeDocx(draft, { identity, targetTitle: run.targetTitle })

  const directory = `baseline-run-${runId}`
  const fileName = `${filenamePart(run.direction)}-${filenamePart(run.targetTitle)}-baseline-resume.docx`
  const filePath = `${directory}/${fileName}`
  await mkdir(resolve(getArtifactsRoot(), directory), { recursive: true })
  await writeFile(resolve(getArtifactsRoot(), filePath), resumeDocx)
  return { fileName, filePath, mimeType: docxMimeType }
}
