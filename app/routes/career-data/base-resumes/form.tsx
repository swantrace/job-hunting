import { createRoute } from 'honox/factory'
import {
  assertBaseResumeImmutable,
  createBaseResumeDraft,
  listBaseResumeVersions,
  readBaseResumeVersion,
} from '../../../../src/db/career-base-resumes'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { CareerReferenceError } from '../../../../src/db/career-state'
import { db } from '../../../../src/db/client'
import {
  baseResumeDraftFormSchema,
  baseResumeDraftFormValues,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../src/lib/request'
import {
  BaseResumeDraftForm,
  baseResumeDraftFormRootId,
} from '../../../components/career/BaseResumeDraftForm'
import { BaseResumeList } from '../../../components/career/BaseResumeList'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

/**
 * New draft form. `?from=<id>` copies an existing version's Markdown into a new
 * draft (editing never rewrites the stored version), and `?direction=<key>`
 * preselects the direction.
 */
export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const from = parseId(c.req.query('from'))
  const source = from === null ? null : readBaseResumeVersion(db, from)
  const requested = c.req.query('direction') ?? ''
  const directionKey =
    source?.directionKey ??
    (view.referenceDirections.some((direction) => direction.key === requested) ? requested : '')
  return c.html(
    <BaseResumeDraftForm
      values={baseResumeDraftFormValues(source, { directionKey })}
      directions={view.referenceDirections}
    />,
  )
})

/**
 * Creates one immutable Base Resume draft. A version label that already exists
 * for the direction is refused with an inline 422 naming the immutability; the
 * stored Markdown is never overwritten.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, baseResumeDraftFormValues(null))
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <BaseResumeDraftForm
        values={submitted}
        directions={view.referenceDirections}
        feedback={feedback}
      />,
      status,
    )

  const parsed = baseResumeDraftFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, baseResumeDraftFormRootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }

  const version = parsed.data.version.trim()
  const existing = listBaseResumeVersions(db, parsed.data.directionKey).find(
    (row) => row.version === version,
  )
  if (existing) {
    let message: string
    try {
      assertBaseResumeImmutable(existing, { markdown: parsed.data.markdown })
      message = `Base Resume version "${version}" already exists for this direction.`
    } catch (error) {
      message = error instanceof Error ? error.message : 'A Base Resume version is immutable.'
    }
    retargetFragment(c, baseResumeDraftFormRootId)
    return render({ message }, 422)
  }

  try {
    createBaseResumeDraft(db, {
      directionKey: parsed.data.directionKey,
      version,
      markdown: parsed.data.markdown,
    })
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, baseResumeDraftFormRootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  return c.html(
    <>
      <BaseResumeDraftForm
        values={baseResumeDraftFormValues(null)}
        directions={refreshed.referenceDirections}
      />
      <BaseResumeList
        directions={refreshed.directions}
        versions={refreshed.baseResumes}
        includeRetired={includeRetired}
        oob
      />
      <CareerDataTabs activeTab="base-resumes" oob />
      <FlashMessage autoDismiss>Draft created.</FlashMessage>
    </>,
  )
})
