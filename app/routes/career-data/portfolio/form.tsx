import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import {
  createCareerPortfolioTopic,
  listCareerPortfolioTopics,
} from '../../../../src/db/career-records'
import { CareerReferenceError } from '../../../../src/db/career-state'
import { db } from '../../../../src/db/client'
import { saveRecordExtensions, storedRecordExtensions } from '../../../../src/lib/career/extensions'
import {
  careerStableKey,
  portfolioTopicFormSchema,
  portfolioTopicFormValues,
  portfolioTopicInput,
  resolveFieldValue,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { PortfolioForm, portfolioFormRootId } from '../../../components/career/PortfolioForm'
import { PortfolioList } from '../../../components/career/PortfolioList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PortfolioForm
      values={portfolioTopicFormValues(null, null)}
      recordId={null}
      includeRetired={includeRetired}
      projects={view.referenceProjects}
      directions={view.referenceDirections}
    />,
  )
})

/**
 * Creates one portfolio topic. The stable key is generated (never typed) and
 * stays the record identity when the title is renamed.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = portfolioFormRootId(null)
  const fallback = portfolioTopicFormValues(null, null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <PortfolioForm
        values={submitted}
        recordId={null}
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

  let createdId: number
  let stableKey: string
  try {
    stableKey = careerStableKey(
      [parsed.data.title],
      listCareerPortfolioTopics(db, { includeRetired: true }).map((row) => row.stableKey),
    )
    createdId = createCareerPortfolioTopic(
      db,
      portfolioTopicInput(parsed.data, {
        stableKey,
        details: resolveFieldValue(null, parsed.data.details),
      }),
    ).id
    saveRecordExtensions(db, 'portfolioTopics', stableKey, parsed.data.extensionFields)
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const record = refreshed.portfolioTopics.find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <PortfolioForm
        values={portfolioTopicFormValues(
          record,
          storedRecordExtensions(db, 'portfolioTopics', record.stableKey),
        )}
        recordId={record.id}
        stableKey={record.stableKey}
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
      <FlashMessage autoDismiss>Portfolio topic added.</FlashMessage>
    </>,
  )
})
