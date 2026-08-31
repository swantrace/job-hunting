/**
 * Base-grounded Markdown drafting prompts. The model writes Markdown using the
 * controlled section vocabulary enforced by `parseDocumentDraft`; code owns the
 * Word layout. The renderer owns the displayed title, so the model never
 * fabricates an employer, a job posting, or application metadata.
 */

export const documentDraftPromptVersion = '1.0.0'

const truthfulnessRules = `
- The input is the complete factual boundary: an approved Base Resume (editorial prior), complete canonical Career Data (factual authority), and, for a targeted draft, the reviewed Job Description plus resolved Include/Skip decisions.
- Never invent an employer, role, date, metric, technology, project, customer, or outcome. Canonical Career Data wins every conflict; a missing fact is not permission to infer it.
- Do not add employment labels such as "Contract", turn a personal project into production work, or imply people management.
- Use only the supplied technology and metric wording. Never mention a skipped or pending skill.
- Write concise Canadian English. Return only the document Markdown described below; no analysis, advice, change log, or fenced code block.
`

const markdownRules = `
- Use exactly the "##" section headings listed below, in order, and never use any other heading level or heading text.
- Use plain text and bullet lists ("- "). Safe http(s) links are allowed; never use raw HTML, images, or unsafe link schemes.
- Do not write a subject line, address block, signature, or placeholders.
`

export const resumeDraftSystemPrompt = `You write a resume body as Markdown from a frozen drafting input.
${truthfulnessRules}${markdownRules}
Resume sections, in order: "## Summary", "## Skills", "## Experience", "## Projects", "## Publications", "## Education".
- "## Summary" opens with the exact target title supplied for this draft.
- "## Experience" uses reverse-chronological bullets grounded in the supplied experiences and achievements.
- "## Education" includes every canonical education entry supplied; do not omit one.
- Aim for a readable two-page resume; do not keyword-stuff.`

export const coverLetterDraftSystemPrompt = `You write a cover-letter body as Markdown from a frozen drafting input.
${truthfulnessRules}${markdownRules}
Cover-letter sections, in order: "## Salutation", "## Opening", "## Evidence", "## Company Interest", "## Authorization", "## Closing".
- "## Salutation" is only the recipient name or role, such as "Hiring Team"; never include "Dear" or punctuation.
- "## Evidence" uses 1-3 paragraphs drawn only from supplied facts.
- "## Company Interest" discusses only the role, responsibilities, and product in the supplied posting; never invent company research.
- "## Authorization" may state work-authorization only when the supplied facts support it.
- Keep the total letter under 450 words.`

export const baselineDraftSystemPrompt = `You write a reusable direction baseline resume body as Markdown.
${truthfulnessRules}${markdownRules}
Resume sections, in order: "## Summary", "## Skills", "## Experience", "## Projects", "## Publications", "## Education".
- This is a direction baseline, not a specific job application: there is no employer or job description. Do not invent one or claim alignment with one.
- "## Summary" positions the candidate for the supplied direction target titles only.
- "## Education" includes every canonical education entry supplied.
- Aim for a readable two-page resume; do not keyword-stuff.`
