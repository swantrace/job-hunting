import { describe, expect, test } from 'bun:test'
import {
  activeStatuses,
  applicationSortLabels,
  applicationSortValues,
  applicationViewLabels,
  applicationViews,
  matchLevels,
  priorities,
  statuses,
} from '../src/lib/applications/constants'
import { evidenceSourceTypes } from '../src/lib/evidence/constants'
import { generatedArtifactTypes, runStatuses } from '../src/lib/generation/constants'
import {
  analysisRequirementBases,
  persistedRequirementBases,
  requirementImportances,
  requirementTypes,
} from '../src/lib/job-requirements/constants'
import { skillImportances } from '../src/lib/skills/constants'
import { workspaceTabLabels, workspaceTabs } from '../src/lib/workspace/constants'

describe('domain-owned runtime constants', () => {
  test('keeps every application subset and label map anchored to its canonical values', () => {
    expect(activeStatuses.every((status) => statuses.includes(status))).toBe(true)
    expect(Object.keys(applicationViewLabels)).toEqual([...applicationViews])
    expect(Object.keys(applicationSortLabels)).toEqual([...applicationSortValues])
    expect(priorities).toEqual(['A', 'B', 'C'])
    expect(matchLevels).toEqual(['A', 'B'])
  })

  test('uses one lifecycle for every persisted asynchronous run', () => {
    expect(runStatuses).toEqual(['Queued', 'Processing', 'Completed', 'Failed'])
    expect(generatedArtifactTypes).toEqual(['job_context', 'resume', 'cover_letter'])
  })

  test('derives model and skill requirement vocabularies from the shared domain contract', () => {
    expect(persistedRequirementBases).toEqual([...analysisRequirementBases, 'legacy'])
    expect(skillImportances).toBe(requirementImportances)
    expect(requirementTypes).toContain('skill')
  })

  test('keeps workspace and evidence metadata complete', () => {
    expect(Object.keys(workspaceTabLabels)).toEqual([...workspaceTabs])
    expect(evidenceSourceTypes).toEqual([
      'experience',
      'achievement',
      'project',
      'publication',
      'skill',
      'story',
    ])
  })
})
