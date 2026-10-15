import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerPublications,
  updateCareerPublication,
} from '../../../../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-shared'
import { db } from '../../../../../src/db/client'
import {
  saveRecordExtensions,
  storedRecordExtensions,
} from '../../../../../src/lib/career/extensions'
import {
  parsePublicationForm,
  publicationAuthorValues,
  publicationFormValues,
  publicationInput,
  submittedAuthorValues,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import {
  PublicationForm,
  publicationFormRootId,
} from '../../../../components/career/PublicationForm'
import { PublicationList } from '../../../../components/career/PublicationList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findPublication(id: number | null) {
  return id === null
    ? undefined
    : listCareerPublications(db, { includeRetired: true }).find((row) => row.id === id)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findPublication(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PublicationForm
      values={publicationFormValues(
        record,
        storedRecordExtensions(db, 'publications', record.stableKey),
      )}
      authors={publicationAuthorValues(record)}
      recordId={record.id}
      stableKey={record.stableKey}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      projects={view.referenceProjects}
      directions={view.referenceDirections}
    />,
  )
})

/**
 * Updates one publication with the revision the form was rendered with, so a
 * stale submit is a 409 fragment (with a reload action) instead of a lost
 * update. The stable key is taken from the stored record and cannot change.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findPublication(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = publicationFormRootId(record.id)
  const fallbackAuthors = publicationAuthorValues(record)
  const fallback = publicationFormValues(
    record,
    storedRecordExtensions(db, 'publications', record.stableKey),
  )
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const submittedAuthors = submittedAuthorValues(raw, fallbackAuthors)
  const render = (
    authors: typeof submittedAuthors,
    feedback?: CareerFormFeedback,
    status: 200 | 409 | 422 = 200,
  ) =>
    c.html(
      <PublicationForm
        values={submitted}
        authors={authors}
        recordId={record.id}
        stableKey={record.stableKey}
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
  if (parsed.values.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render(submittedAuthors, { message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerPublication(
      db,
      record.id,
      publicationInput(parsed.values, { stableKey: record.stableKey, authors: parsed.authors }),
      { expectedRevision: parsed.values.expectedRevision },
    )
    saveRecordExtensions(db, 'publications', record.stableKey, parsed.values.extensionFields)
  } catch (error) {
    if (error instanceof CareerRevisionConflictError) {
      retargetFragment(c, rootId)
      return render(submittedAuthors, { conflict: true }, 409)
    }
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render(submittedAuthors, { message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const updated = refreshed.publications.find((row) => row.id === record.id) ?? record
  return c.html(
    <>
      <PublicationForm
        values={publicationFormValues(
          updated,
          storedRecordExtensions(db, 'publications', updated.stableKey),
        )}
        authors={publicationAuthorValues(updated)}
        recordId={updated.id}
        stableKey={updated.stableKey}
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
      <FlashMessage autoDismiss>Publication saved.</FlashMessage>
    </>,
  )
})
