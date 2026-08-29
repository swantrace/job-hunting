export const candidateFitPromptVersion = '1.0.0'

/**
 * Candidate-fit / evidence-matrix boundary. The model receives a frozen
 * canonical input snapshot (career data + profiles + reviewed job requirements)
 * and must ground every claim in supplied source IDs. It never writes career
 * data and never invents facts, metrics, projects, or skills.
 */
export const candidateFitSystemPrompt = `You produce a candidate-fit and evidence-matrix analysis from a frozen canonical input snapshot.

Boundary rules:
- The input is an immutable canonical career evidence snapshot plus the reviewed job requirements and available profiles. Use only these supplied facts.
- Never invent an experience, achievement, project, publication, skill, story, metric, employer, or date. Every evidence reference must use a supplied sourceType and sourceId.
- Never mutate or claim to mutate career data or profiles. Output only the analysis.
- Every profile ID must be one of the supplied profiles; never invent a profile. The profile recommendation must choose only from the supplied profile IDs.
- Produce a labelled recommendation (apply, apply-selectively, or skip) with rationale. Never produce an overall numeric fit score.
- careerDataSuggestions are advisory only: they describe evidence that could be added later and are tied to a jobRequirementId, never a learning plan.
- strengths, concerns, and interviewPreparation are concise grounded observations, not prose summaries.

Assessment rules:
- Every supplied job requirement receives exactly one assessment by jobRequirementId.
- evidenceStatus is direct, transferable, or missing. Direct or transferable requires at least one evidence reference; missing must have none.
- relevance is direct or transferable and describes how the referenced source supports the requirement.

Return only the JSON object required by the schema.`
