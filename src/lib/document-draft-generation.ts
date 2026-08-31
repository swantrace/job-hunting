import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  baselineDraftSystemPrompt,
  coverLetterDraftSystemPrompt,
  documentDraftPromptVersion,
  resumeDraftSystemPrompt,
} from '../ai/prompts/document-draft'
import {
  getBaselineGenerationRun,
  getGenerationSource,
  saveBaselineGenerationEvidenceSnapshot,
  saveBaselineGenerationResults,
  saveGenerationEvidenceSnapshot,
  saveGenerationRunResults,
} from '../db/generation'
import { getArtifactsRoot } from './artifact-storage'
import { type DocumentDraft, parseDocumentDraft } from './document-draft'
import {
  buildBaselineDocumentDraftSnapshot,
  buildDocumentDraftSnapshot,
  type DocumentDraftSnapshot,
} from './document-draft-input'
import { extractMetricClaims, validateDocumentDraft } from './document-draft-validation'
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
      text: { format: { type: 'text' } },
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
  return stripMarkdownFence(output)
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

function validateResumeDraft(draft: DocumentDraft, snapshot: DocumentDraftSnapshot, title: string) {
  return validateDocumentDraft(draft, {
    targetTitle: title,
    education: educationEntries(snapshot),
    title,
    supportedMetrics: supportedMetrics(snapshot),
    excludedSkills: snapshot.excludedSkills,
  })
}

function validateCoverLetterDraft(draft: DocumentDraft, snapshot: DocumentDraftSnapshot) {
  return validateDocumentDraft(draft, {
    salutation: sectionText(draft, 'salutation'),
    maxWords: 450,
    supportedMetrics: supportedMetrics(snapshot),
    excludedSkills: snapshot.excludedSkills,
  })
}

async function writeDraftArtifacts(
  directory: string,
  files: Array<{ name: string; content: string; type: GeneratedArtifactType; mimeType: string }>,
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
    resume: validateResumeDraft(resumeDraft, snapshot, source.application.jobTitle),
    coverLetter: validateCoverLetterDraft(coverLetterDraft, snapshot),
  }
  saveGenerationRunResults(runId, {
    resumeJson: null,
    coverLetterJson: null,
    atsAuditJson: null,
    resumeMarkdown,
    coverLetterMarkdown,
    draftValidationJson: JSON.stringify(validation),
    rendererVersion: null,
  })

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
      name: `${baseName}-resume.md`,
      content: `${resumeMarkdown.trim()}\n`,
      type: 'resume',
      mimeType: 'text/markdown',
    },
    {
      name: `${baseName}-cover-letter.md`,
      content: `${coverLetterMarkdown.trim()}\n`,
      type: 'cover_letter',
      mimeType: 'text/markdown',
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
    resume: validateResumeDraft(draft, snapshot, run.targetTitle),
  }
  saveBaselineGenerationResults(runId, {
    resumeMarkdown,
    draftValidationJson: JSON.stringify(validation),
    rendererVersion: null,
  })

  const directory = `baseline-run-${runId}`
  const fileName = `${filenamePart(run.direction)}-${filenamePart(run.targetTitle)}-baseline-resume.md`
  const filePath = `${directory}/${fileName}`
  await mkdir(resolve(getArtifactsRoot(), directory), { recursive: true })
  await writeFile(resolve(getArtifactsRoot(), filePath), `${resumeMarkdown.trim()}\n`)
  return { fileName, filePath, mimeType: 'text/markdown' }
}
