import { mock } from 'bun:test'
import { z } from 'zod'
import type { JobCardData } from '../../../src/db/queries'
import * as realSkillQueries from '../../../src/db/skill-queries'
import * as realCareerData from '../../../src/lib/career-data'
import * as realValidation from '../../../src/lib/validation'

export const mockStatusSafeParse = mock(() => ({
  data: { action: 'today' },
  success: true,
}))

export const mockGetApplication = mock((): JobCardData => mockJob)

export const mockApplicationSafeParse = mock(() => ({
  error: {
    flatten: () => ({ fieldErrors: { jobTitle: ['Job title is required.'] } }),
  },
  success: false,
}))

// Reconstructed from src/lib/validation so a leaked mock still validates
// Skip/Include exactly like production; UI tests override it via mockReturnValue.
const realSkillDecisionSchema = z
  .object({
    action: z.enum(['skip', 'include']),
    reason: z.string().trim().max(2000).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'include' && value.reason.trim() === '')
      ctx.addIssue({
        code: 'custom',
        message: 'A reason is required to include this skill.',
        path: ['reason'],
      })
  })

export const mockSkillDecisionSafeParse = (value: unknown) =>
  realSkillDecisionSchema.safeParse(value)

export const mockGetApplicationSkillRequirement = mock((): any => undefined)
export const mockListApplicationSkillRequirements = mock((): any => [])
export const mockSkipRemainingSkillDecisions = mock((): any => {})
export const mockUpdateSkillDecision = mock((): any => {})
export const mockHasPendingSkillDecisions = mock(() => false)

export const mockJob = {
  appliedDate: null,
  applicationSource: 'LinkedIn',
  applyTodayTargetDate: null,
  companyId: 3,
  companyName: 'Example Company',
  companyWebsite: 'https://example.com',
  contacts: [],
  createdAt: '2026-08-20',
  direction: 'fullstack',
  id: 7,
  jobPosting: undefined,
  jobPostingAnalysis: undefined,
  jobTitle: 'Full-Stack Developer',
  location: 'Edmonton, AB',
  matchLevel: null,
  notes: null,
  postedDate: '2026-08-20',
  priority: 'B',
  resumeVersion: null,
  salary: null,
  skills: [],
  status: 'Saved',
  statusBeforeArchive: null,
  updatedAt: '2026-08-20',
  url: 'https://example.com/jobs/7',
} satisfies JobCardData

mock.module('honox/factory', () => ({
  createRoute: <T>(handler: T) => handler,
}))

mock.module('../../../src/db/queries', () => ({
  changeStatus: () => true,
  createApplication: () => 5,
  createCompany: () => true,
  createContact: () => true,
  createSkill: () => true,
  deleteManagedItem: () => true,
  getActivity: () => ({ followUps: [], interviews: [] }),
  getApplication: mockGetApplication,
  listApplications: () => [mockJob],
  listManagementData: () => ({ companies: [], contacts: [], skills: [] }),
  metrics: () => ({
    Applied: 0,
    'Apply Today': 0,
    'Follow Up': 0,
    Interviewing: 0,
    Saved: 1,
  }),
  updateApplication: () => true,
  updateManagedItem: () => true,
}))

export const mockGetGenerationState = mock((): any => ({
  state: 'never-run',
  latest: null,
  latestCompleted: null,
  currentCompleted: null,
  staleCompleted: null,
  reasons: [],
}))

mock.module('../../../src/db/generation', () => ({
  getGenerationEvidenceSnapshot: () => null,
  getGenerationRunResults: () => null,
  getGenerationState: mockGetGenerationState,
  getGoogleDriveConnection: () => null,
  listBaselineGenerationRuns: () => [],
  listGenerationRuns: () => [],
}))

export const mockEnqueueGeneration = mock(async () => ({ id: 1 }))
export const mockEnqueueBaselineGeneration = mock(async () => ({ id: 1 }))

mock.module('../../../src/lib/generation-queue', () => ({
  enqueueBaselineGeneration: mockEnqueueBaselineGeneration,
  enqueueGeneration: mockEnqueueGeneration,
}))

export const mockEnqueueCandidateAnalysis = mock(
  async () =>
    ({
      run: { id: 1, status: 'Queued', attempts: 0, errorMessage: null, model: null },
      reused: false,
    }) as const,
)
export const mockListAnalysisRuns = mock((): any => [])
export const mockGetAnalysisRun = mock((): any => null)
export const mockConfirmProfileSelection = mock(() => true)
export const mockCurrentCandidateAnalysisHash = mock(() => 'current-hash')

mock.module('../../../src/lib/analysis-queue', () => ({
  enqueueCandidateAnalysis: mockEnqueueCandidateAnalysis,
}))

mock.module('../../../src/db/analysis', () => ({
  confirmProfileSelection: mockConfirmProfileSelection,
  getAnalysisRun: mockGetAnalysisRun,
  listAnalysisRuns: mockListAnalysisRuns,
}))

export const mockLoadReviewData = mock((): any => ({
  job: mockJob,
  run: null,
  state: {
    state: 'never-run',
    latest: null,
    latestCompleted: null,
    currentCompleted: null,
    staleCompleted: null,
    reasons: [],
  },
  requirements: [],
  profiles: [],
}))

mock.module('../../../src/db/review-data', () => ({
  loadReviewData: mockLoadReviewData,
}))

export const mockGetApplicationReadiness = mock((): any => ({ ready: true, reasons: [] }))

mock.module('../../../src/lib/application-readiness', () => ({
  getApplicationReadiness: mockGetApplicationReadiness,
}))

export const mockComputeWorkspaceAvailability = mock((): any => ({
  jobAnalysisCurrent: true,
  reviewReady: true,
  hasHistoricalReview: false,
  hasHistoricalDocuments: false,
}))

mock.module('../../../src/lib/workspace/availability', () => ({
  computeWorkspaceAvailability: mockComputeWorkspaceAvailability,
}))

export const mockListDocumentReviews = mock((): any => [])
export const mockEnqueueDocumentReview = mock(
  async () => ({ review: { id: 1, status: 'Queued' } }) as const,
)

mock.module('../../../src/db/document-review', () => ({
  listDocumentReviews: mockListDocumentReviews,
}))

mock.module('../../../src/lib/document-review-queue', () => ({
  enqueueDocumentReview: mockEnqueueDocumentReview,
}))

export const mockGetCandidateAnalysisState = mock((): any => ({
  state: 'never-run',
  latest: null,
  latestCompleted: null,
  currentCompleted: null,
  staleCompleted: null,
  reasons: [],
}))

mock.module('../../../src/lib/candidate-analysis', () => ({
  currentCandidateAnalysisHash: mockCurrentCandidateAnalysisHash,
  getCandidateAnalysisState: mockGetCandidateAnalysisState,
}))

export const mockSkipRemainingRunDecisions = mock((): any => {})
export const mockDecideRunSkill = mock((): any => {})

mock.module('../../../src/db/analysis-decision-service', () => ({
  skipRemainingRunDecisions: mockSkipRemainingRunDecisions,
  decideRunSkill: mockDecideRunSkill,
}))

mock.module('../../../src/lib/profiles', () => ({
  listProfiles: () => [{ id: 'fullstack', label: 'Full Stack' }],
}))

mock.module('../../../src/lib/evidence-selection', () => ({
  evidenceSelectionSnapshotSchema: {
    safeParse: () => ({ success: false }),
  },
}))

mock.module('../../../src/lib/request', () => ({
  parseFilters: () => ({
    attributes: '',
    priority: '',
    q: '',
    sort: 'updated_desc',
    statuses: '',
    today: '',
    view: 'list',
  }),
  parseForm: async (c: { req: { formData: () => Promise<FormData> } }) => {
    try {
      return Object.fromEntries((await c.req.formData()).entries())
    } catch {
      return {}
    }
  },
  parseId: (value: string) => Number(value),
  parseWorkspaceTab: (c: { req: { query: (name: string) => string | undefined } }) =>
    c.req.query('workspaceTab') ?? 'application',
}))

mock.module('../../../src/lib/validation', () => ({
  ...realValidation,
  applicationSchema: { safeParse: mockApplicationSafeParse },
  skillDecisionSchema: { safeParse: mockSkillDecisionSafeParse },
  statusSchema: { safeParse: mockStatusSafeParse },
}))

mock.module('../../../src/db/skill-queries', () => ({
  ...realSkillQueries,
  getApplicationSkillRequirement: mockGetApplicationSkillRequirement,
  hasPendingSkillDecisions: mockHasPendingSkillDecisions,
  listApplicationSkillRequirements: mockListApplicationSkillRequirements,
  skipRemainingSkillDecisions: mockSkipRemainingSkillDecisions,
  updateSkillDecision: mockUpdateSkillDecision,
}))

mock.module('../../../src/lib/career-data', () => ({
  ...realCareerData,
  careerSkillEvidenceMap: () => ({}),
}))
