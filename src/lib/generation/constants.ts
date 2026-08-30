export const runStatuses = ['Queued', 'Processing', 'Completed', 'Failed'] as const
export type RunStatus = (typeof runStatuses)[number]

export const generatedArtifactTypes = ['job_context', 'resume', 'cover_letter'] as const
export type GeneratedArtifactType = (typeof generatedArtifactTypes)[number]
