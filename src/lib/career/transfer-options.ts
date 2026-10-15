import { listBaseResumeVersions } from '../../db/career-base-resumes'
import { loadCareerDataView } from '../../db/career-data-view'
import { readCareerState } from '../../db/career-state'
import { db } from '../../db/client'
import type { DbExecutor } from '../../db/skill-queries'
import { type ChatGptContextPreview, previewChatGptContext } from './chatgpt-context'

/**
 * Everything the Career data "Import & export" tab renders, derived from the
 * database and the query string so the page, the context-preview fragment and
 * the tests all agree on what is in scope.
 */
export type CareerTransferOptions = {
  revision: number
  directions: { key: string; label: string }[]
  datasetDirectionKey: string
  contextDirectionKey: string
  includeSourceUrls: boolean
  includeContactDetails: boolean
  contextPreview: ChatGptContextPreview
  /** Set when no direction has an approved Base Resume to export. */
  contextError?: string
}

/**
 * Normalises the transfer-tab query inputs. An unknown direction key falls back
 * to the full scope instead of failing: the link is a bookmarkable choice, not a
 * security boundary, and the preview always states what is actually in scope.
 */
export type CareerTransferQuery = {
  datasetDirectionKey: string
  contextDirectionKey: string
  includeSourceUrls: boolean
  includeContactDetails: boolean
}

function queryValue(value: string | undefined): string {
  return value?.trim() ?? ''
}

export function parseCareerTransferQuery(
  query: (name: string) => string | undefined,
): CareerTransferQuery {
  return {
    datasetDirectionKey: queryValue(query('datasetDirection')),
    contextDirectionKey: queryValue(query('contextDirection')),
    includeSourceUrls: queryValue(query('includeSourceUrls')) !== '',
    includeContactDetails: queryValue(query('includeContactDetails')) !== '',
  }
}

/** What an export would contain when no approved Base Resume exists to export. */
function emptyContextPreview(query: CareerTransferQuery): ChatGptContextPreview {
  return {
    scope: { kind: 'full' },
    directions: [],
    directionsMissingBaseResume: [],
    counts: {
      safeAchievements: 0,
      safePublications: 0,
      eligibleProjects: 0,
      personalSkills: 0,
      stories: 0,
      experiences: 0,
      education: 0,
    },
    includeSourceUrls: query.includeSourceUrls,
    includeContactDetails: query.includeContactDetails,
    excludedKinds: [],
    reason: '',
  }
}

/**
 * The ChatGPT context preview for the query's scope and privacy choices, with the
 * actionable error the panel should show when nothing is exportable.
 */
export function contextPreviewFor(
  executor: DbExecutor,
  query: CareerTransferQuery,
): { preview: ChatGptContextPreview; error?: string } {
  const directions = loadCareerDataView(executor).directions
  const hasAnyExportable = directions.some((direction) =>
    listBaseResumeVersions(executor, direction.key).some(
      (version) => version.status === 'approved',
    ),
  )
  if (!hasAnyExportable) {
    return {
      preview: emptyContextPreview(query),
      error:
        'No direction has an approved Base Resume yet. Approve one on the Base resumes tab before exporting a ChatGPT context.',
    }
  }
  return {
    preview: previewChatGptContext(executor, {
      directionKey: query.contextDirectionKey === '' ? null : query.contextDirectionKey,
      includeSourceUrls: query.includeSourceUrls,
      includeContactDetails: query.includeContactDetails,
    }),
  }
}

export function loadCareerTransferOptions(
  executor: DbExecutor = db,
  query: CareerTransferQuery,
): CareerTransferOptions {
  const directions = loadCareerDataView(executor).directions.map((direction) => ({
    key: direction.key,
    label: direction.label,
  }))
  const isKnown = (key: string) => key === '' || directions.some((row) => row.key === key)
  const contextDirectionKey = isKnown(query.contextDirectionKey) ? query.contextDirectionKey : ''
  const datasetDirectionKey = isKnown(query.datasetDirectionKey) ? query.datasetDirectionKey : ''
  const { preview, error } = contextPreviewFor(executor, { ...query, contextDirectionKey })
  return {
    revision: readCareerState(executor).revision,
    directions,
    datasetDirectionKey,
    contextDirectionKey,
    includeSourceUrls: query.includeSourceUrls,
    includeContactDetails: query.includeContactDetails,
    contextPreview: preview,
    ...(error ? { contextError: error } : {}),
  }
}
