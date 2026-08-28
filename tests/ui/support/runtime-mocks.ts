import { mock } from 'bun:test'
import type { JobCardData } from '../../../src/db/queries'

export const mockStatusSafeParse = mock(() => ({
  data: { action: 'today' },
  success: true,
}))

export const mockApplicationSafeParse = mock(() => ({
  error: {
    flatten: () => ({ fieldErrors: { jobTitle: ['Job title is required.'] } }),
  },
  success: false,
}))

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
  createCompany: () => true,
  createContact: () => true,
  createSkill: () => true,
  deleteManagedItem: () => true,
  getActivity: () => ({ followUps: [], interviews: [] }),
  getApplication: () => mockJob,
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

mock.module('../../../src/db/generation', () => ({
  getGenerationEvidenceSnapshot: () => null,
  getGoogleDriveConnection: () => null,
  listBaselineGenerationRuns: () => [],
  listGenerationRuns: () => [],
}))

mock.module('../../../src/lib/generation-queue', () => ({
  enqueueBaselineGeneration: async () => {},
  enqueueGeneration: async () => {},
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
  parseForm: async () => ({ action: 'today' }),
  parseId: (value: string) => Number(value),
  parseWorkspaceTab: (c: { req: { query: (name: string) => string | undefined } }) =>
    c.req.query('workspaceTab') ?? 'application',
}))

mock.module('../../../src/lib/validation', () => ({
  applicationAttributeLabels: {
    appliedDate: 'Applied date',
    company: 'Company',
    location: 'Location',
    matchLevel: 'Match level',
    notes: 'Notes',
    priority: 'Priority',
    source: 'Source',
    status: 'Status',
    targetDate: 'Target date',
    title: 'Job title',
  },
  applicationAttributes: [
    'company',
    'title',
    'location',
    'priority',
    'status',
    'appliedDate',
    'targetDate',
    'source',
    'matchLevel',
    'notes',
  ],
  applicationSchema: { safeParse: mockApplicationSafeParse },
  baselineGenerationSchema: {
    safeParse: () => ({
      success: false,
      error: { issues: [{ message: 'Direction is required' }] },
    }),
  },
  companySchema: { safeParse: () => ({ success: false }) },
  defaultAttributes: ['company', 'title', 'status', 'priority', 'location', 'appliedDate'],
  managedContactSchema: { safeParse: () => ({ success: false }) },
  parseCsvList: (value = '') =>
    value
      .split(',')
      .map((item: string) => item.trim())
      .filter(Boolean),
  skillSchema: { safeParse: () => ({ success: false }) },
  statusSchema: { safeParse: mockStatusSafeParse },
  statusesFromFilters: (filters: { statuses: string; today: string }) =>
    filters.today === '1'
      ? ['Apply Today']
      : filters.statuses
        ? filters.statuses.split(',')
        : ['Saved', 'Apply Today', 'Applied', 'Follow Up', 'Interviewing'],
}))
