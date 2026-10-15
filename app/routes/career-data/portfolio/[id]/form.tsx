import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerPortfolioTopics,
  updateCareerPortfolioTopic,
} from '../../../../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-state'
import { db } from '../../../../../src/db/client'
import {
  saveRecordExtensions,
  storedRecordExtensions,
} from '../../../../../src/lib/career/extensions'
import {
  portfolioTopicFormSchema,
  portfolioTopicFormValues,
  portfolioTopicInput,
  resolveFieldValue,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import { PortfolioForm, portfolioFormRootId } from '../../../../components/career/PortfolioForm'
import { PortfolioList } from '../../../../components/career/PortfolioList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findTopic(id: number | null) {
  return id === null
    ? undefined
    : listCareerPortfolioTopics(db, { includeRetired: true }).find((row) => row.id === id)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findTopic(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PortfolioForm
      values={portfolioTopicFormValues(
        record,
        storedRecordExtensions(db, 'portfolioTopics', record.stableKey),
      )}
      recordId={record.id}
      stableKey={record.stableKey}
      includeRetired={includeRetired}
      projects={view.referenceProjects}
      directions={view.referenceDirections}
    />,
  )
})

/**
 * Updates one portfolio topic with the revision the form was rendered with, so a
 * stale submit is a 409 fragment (with a reload action) instead of a lost
 * update. The stable key is taken from the stored record and cannot change, and
 * a portfolio-only edit never enters the document freshness identity.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findTopic(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = portfolioFormRootId(record.id)
  const fallback = portfolioTopicFormValues(
    record,
    storedRecordExtensions(db, 'portfolioTopics', record.stableKey),
  )
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <PortfolioForm
        values={submitted}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
        feedback={feedback}
        projects={view.referenceProjects}
        directions={view.referenceDirections}
      />,
      status,
    )

  const parsed = portfolioTopicFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerPortfolioTopic(
      db,
      record.id,
      portfolioTopicInput(parsed.data, {
        stableKey: record.stableKey,
        details: resolveFieldValue(record.details, parsed.data.details),
      }),
      { expectedRevision: parsed.data.expectedRevision },
    )
    saveRecordExtensions(db, 'portfolioTopics', record.stableKey, parsed.data.extensionFields)
  } catch (error) {
    if (error instanceof CareerRevisionConflictError) {
      retargetFragment(c, rootId)
      return render({ conflict: true }, 409)
    }
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const updated = refreshed.portfolioTopics.find((row) => row.id === record.id) ?? record
  return c.html(
    <>
      <PortfolioForm
        values={portfolioTopicFormValues(
          updated,
          storedRecordExtensions(db, 'portfolioTopics', updated.stableKey),
        )}
        recordId={updated.id}
        stableKey={updated.stableKey}
        includeRetired={includeRetired}
        projects={refreshed.referenceProjects}
        directions={refreshed.referenceDirections}
      />
      <PortfolioList
        topics={refreshed.portfolioTopics}
        includeRetired={includeRetired}
        projects={refreshed.allProjects}
        directions={refreshed.allDirections}
        oob
      />
      <CareerDataTabs activeTab="portfolio" oob />
      <FlashMessage autoDismiss>Portfolio topic saved.</FlashMessage>
    </>,
  )
})
