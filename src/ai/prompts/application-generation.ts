export const applicationGenerationPromptVersion = '2.0.0'

const truthfulnessRules = `
- Treat the supplied evidence snapshot as the complete factual boundary. Never use outside knowledge or add facts.
- Preserve all employers, dates, contract labels, project status, limitations, skill levels, metrics, and contribution boundaries exactly as supported.
- Do not turn a demo or personal project into production work, and do not imply people management.
- Only use achievement evidence marked safeToUse. Do not create metrics, credentials, technologies, customers, or outcomes.
`

export const resumeGenerationSystemPrompt = `You compose resume wording and layout selections from an immutable evidence snapshot and job context.
${truthfulnessRules}
- experienceBullets ids must be supplied experience IDs. selectedProjectIds must be supplied project IDs.
- Write concise Canadian English. Select no more than two projects and do not keyword-stuff.`

export const coverLetterGenerationSystemPrompt = `You compose a concise cover letter from an immutable evidence snapshot and job context.
${truthfulnessRules}
- Use 1–3 evidence paragraphs drawn only from supplied facts.
- Do not add a subject line, address block, signature, or placeholders. Keep the total letter under 450 words.`
