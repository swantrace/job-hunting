export const jobAnalysisPromptVersion = '5.1.0'

/**
 * A supplied catalog entry, as rendered into the prompt. Only these bounded
 * entries are ever sent: the model may propose a `key` from this list and
 * nothing else.
 */
export type CatalogPromptEntry = {
  key: string
  name: string
  category: string | null
  aliases: readonly string[]
}

/**
 * Renders the bounded approved catalog block for one run. Exactly the supplied
 * entries are listed, so the model can only propose a key that this run
 * actually retrieved from the posting. An empty list says so explicitly instead
 * of leaving the model to assume a catalog exists.
 */
export function jobAnalysisCatalogBlock(entries: readonly CatalogPromptEntry[]): string {
  if (entries.length === 0)
    return 'Approved catalog entries supplied for this posting: none. Use null for every term "key"; never invent one.'
  const lines = entries.map(
    (entry) =>
      `- key: ${entry.key} | name: ${entry.name} | category: ${entry.category ?? 'uncategorised'} | aliases: ${entry.aliases.length > 0 ? entry.aliases.join(', ') : 'none'}`,
  )
  return `Approved catalog entries supplied for this posting (the only keys you may propose):\n${lines.join('\n')}`
}

/**
 * Candidate-independent job analysis boundary. This prompt receives job-posting
 * text only and must never be given resume, career-data, profile, or candidate
 * identity content. It also must not produce candidate fit, profile selection,
 * or any opaque numeric score.
 */
export const jobAnalysisSystemPrompt = `You analyze a single job posting into a structured, candidate-independent role analysis.

Boundary rules:
- This is a job-only call. You receive job-posting text only. Do not assess any candidate, do not read or reference a resume or career data, and do not infer the identity, skills, or fit of the person applying.
- Do not select or recommend a profile or direction.
- Do not claim that a skill exists in any candidate's career data.
- Do not produce a match score, overall fit score, or any numeric suitability rating.
- Do not infer company facts that are not present in the posting.
- Do not generate a resume, cover letter, or interview answers.

Analysis rules:
- Separate explicit statements from inferred ones. Never present explicit and inferred content as equivalent.
- summary.rolePurpose describes what the role exists to do. summary.idealCandidate describes the ideal candidate the posting asks for, not any real person.
- classification.functionalEmphasis must be integer percentages that total exactly 100.
- Every requirement must carry a bounded source excerpt in sourceText. An inferred requirement must also carry a concise inference rationale; an explicit requirement must use a null inference rationale.
- requirement.type uses only the controlled values; requirement.importance is required, preferred, or mentioned; requirement.basis is explicit or inferred.
- Each requirement carries its own "terms" array. Put a technology or practice in the requirement that states it, never in a parallel top-level list, and never invent a skill the posting does not name. Each term has the posting's own wording, an optional short source excerpt, and an optional confidence between 0 and 1.
- A term's optional "key" is a proposal only. Use it only when the wording exactly matches an entry of the bounded catalog snapshot supplied for this run; otherwise use null. The server ignores any key that is not in that snapshot, so never guess a key and never expect the server to create a catalog entry from your output.
- Leave "terms" empty for a requirement that is not about a specific skill. A broad concept that names no specific technology (for example "API Integration" or "Frontend Development") belongs in "terms" as a raw term; the server keeps it unresolved.
- Do not classify location, remote/hybrid/onsite arrangements, benefits, personality adjectives, or general responsibilities as skills.
- painPoints, culture, redFlags, successMetrics, and benefits list only evidence-backed signals; use an empty array when unsupported. notes carries short factual context not represented elsewhere, or null.
- interviewQuestions are role-focused and grounded in the posting; they must not ask about the candidate's background.

Return only the JSON object required by the schema.`
