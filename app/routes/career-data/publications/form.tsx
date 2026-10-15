import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { createCareerPublication, listCareerPublications } from '../../../../src/db/career-records'
import { CareerReferenceError } from '../../../../src/db/career-shared'
import { db } from '../../../../src/db/client'
import { saveRecordExtensions, storedRecordExtensions } from '../../../../src/lib/career/extensions'
import {
  careerStableKey,
  parsePublicationForm,
  publicationAuthorValues,
  publicationFormValues,
  publicationInput,
  submittedAuthorValues,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { PublicationForm, publicationFormRootId } from '../../../components/career/PublicationForm'
import { PublicationList } from '../../../components/career/PublicationList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PublicationForm
      values={publicationFormValues(null, null)}
      authors={[]}
      recordId={null}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      projects={view.referenceProjects}
      directions={view.referenceDirections}
    />,
  )
})

/**
 * Creates one publication. The stable key is generated (never typed) and stays
 * the record identity when the title is renamed. The ordered authors, including
 * the single candidate author, are validated before the write.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = publicationFormRootId(null)
  const fallback = publicationFormValues(null, null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const submittedAuthors = submittedAuthorValues(raw, [])
  const render = (
    authors: typeof submittedAuthors,
    feedback?: CareerFormFeedback,
    status: 200 | 422 = 200,
  ) =>
    c.html(
      <PublicationForm
        values={submitted}
        authors={authors}
        recordId={null}
        includeRetired={includeRetired}
        feedback={feedback}
        experiences={view.referenceExperiences}
        projects={view.referenceProjects}
        directions={view.referenceDirections}
      />,
      status,
    )

  const parsed = parsePublicationForm(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render(submittedAuthors, { errors: parsed.errors }, 422)
  }

  let createdId: number
  let stableKey: string
  try {
    stableKey = careerStableKey(
      [parsed.values.title],
      listCareerPublications(db, { includeRetired: true }).map((row) => row.stableKey),
    )
    createdId = createCareerPublication(
      db,
      publicationInput(parsed.values, { stableKey, authors: parsed.authors }),
    ).id
    saveRecordExtensions(db, 'publications', stableKey, parsed.values.extensionFields)
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render(submittedAuthors, { message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const record = refreshed.publications.find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <PublicationForm
        values={publicationFormValues(
          record,
          storedRecordExtensions(db, 'publications', record.stableKey),
        )}
        authors={publicationAuthorValues(record)}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
        experiences={refreshed.referenceExperiences}
        projects={refreshed.referenceProjects}
        directions={refreshed.referenceDirections}
      />
      <PublicationList
        publications={refreshed.publications}
        includeRetired={includeRetired}
        experiences={refreshed.allExperiences}
        projects={refreshed.allProjects}
        directions={refreshed.allDirections}
        oob
      />
      <CareerDataTabs activeTab="publications" oob />
      <FlashMessage autoDismiss>Publication added.</FlashMessage>
    </>,
  )
})
