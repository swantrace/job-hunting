import { describe, expect, test } from 'bun:test'
import {
  isTabEnabled,
  resolveWorkspaceTab,
  reviewGateCopy,
  tabAvailability,
  type WorkspaceAvailability,
  workspaceBoundaryIds,
  workspaceTabLabels,
  workspaceTabOrder,
} from '../../src/lib/workspace/state'

const locked: WorkspaceAvailability = {
  jobAnalysisCurrent: false,
  reviewReady: false,
  hasHistoricalReview: false,
  hasHistoricalDocuments: false,
}

const ready: WorkspaceAvailability = {
  jobAnalysisCurrent: true,
  reviewReady: true,
  hasHistoricalReview: true,
  hasHistoricalDocuments: true,
}

describe('workspace tab order and labels', () => {
  test('locks the fixed visible order with URL-compatible internal keys', () => {
    expect(workspaceTabOrder).toEqual([
      'application',
      'review',
      'documents',
      'contacts',
      'activity',
    ])
  })

  test('locks the fixed labels', () => {
    expect(workspaceTabLabels).toEqual({
      application: 'Job Post',
      review: 'Review',
      documents: 'Documents',
      contacts: 'Contact',
      activity: 'Activities',
    })
  })
})

describe('workspace tab availability', () => {
  test('always enables Job Post, Contact, and Activities', () => {
    for (const key of ['application', 'contacts', 'activity'] as const) {
      expect(isTabEnabled(key, locked)).toBe(true)
      expect(isTabEnabled(key, ready)).toBe(true)
    }
  })

  test('locks Review until a current structured job analysis completes', () => {
    expect(isTabEnabled('review', locked)).toBe(false)
    expect(isTabEnabled('review', { ...locked, jobAnalysisCurrent: true })).toBe(true)
  })

  test('locks Documents until the current review is ready', () => {
    expect(isTabEnabled('documents', locked)).toBe(false)
    expect(isTabEnabled('documents', { ...locked, reviewReady: true })).toBe(true)
  })

  test('keeps historical stale Review and Documents accessible', () => {
    expect(isTabEnabled('review', { ...locked, hasHistoricalReview: true })).toBe(true)
    expect(isTabEnabled('documents', { ...locked, hasHistoricalDocuments: true })).toBe(true)
  })

  test('exposes an actionable locked reason for each gated tab', () => {
    const availability = tabAvailability(locked)
    expect(availability.find((tab) => tab.key === 'review')?.lockedReason).toMatch(/job analysis/i)
    expect(availability.find((tab) => tab.key === 'documents')?.lockedReason).toMatch(/review/i)
    expect(availability.find((tab) => tab.key === 'application')?.lockedReason).toBeNull()
  })
})

describe('server-side tab resolution', () => {
  test('falls back to Job Post for unknown tab keys', () => {
    expect(resolveWorkspaceTab('forged-tab', ready)).toBe('application')
    expect(resolveWorkspaceTab(undefined, ready)).toBe('application')
  })

  test('falls back to Job Post for a forged locked tab', () => {
    expect(resolveWorkspaceTab('review', locked)).toBe('application')
    expect(resolveWorkspaceTab('documents', locked)).toBe('application')
  })

  test('keeps a valid enabled tab', () => {
    expect(resolveWorkspaceTab('review', ready)).toBe('review')
    expect(resolveWorkspaceTab('contacts', locked)).toBe('contacts')
  })
})

describe('review state copy', () => {
  test('labels a legacy analysis as outdated with a rerun action', () => {
    const copy = reviewGateCopy('legacy')
    expect(copy.message.toLowerCase()).toMatch(/outdated/)
    expect(copy.actionLabel).toMatch(/re-run|rerun/i)
  })

  test('never conflates a legacy analysis with a never-run state', () => {
    const legacy = reviewGateCopy('legacy')
    const never = reviewGateCopy('never-run')
    expect(legacy.message).not.toBe(never.message)
    expect(legacy.message.toLowerCase()).not.toMatch(/never analyzed|analyze.*first/)
  })

  test('distinguishes stale, failed, and current review states', () => {
    expect(reviewGateCopy('stale').message.toLowerCase()).toMatch(/outdated|upstream/)
    expect(reviewGateCopy('failed').actionLabel).toMatch(/retry/i)
    expect(reviewGateCopy('current').actionLabel).toBe('')
  })
})

describe('workspace boundary ids', () => {
  test('locks the stable fragment boundaries including the job-analysis status', () => {
    expect(workspaceBoundaryIds).toEqual([
      'workspace-shell',
      'workspace-tabs',
      'workspace-job-analysis-status',
      'workspace-review-panel',
      'analysis-run-status',
      'requirement-readiness',
      'workspace-documents-panel',
      'generation-panel',
    ])
  })
})
