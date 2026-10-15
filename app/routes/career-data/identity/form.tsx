import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { saveCareerCandidate } from '../../../../src/db/career-facts'
import { CareerReferenceError, CareerRevisionConflictError } from '../../../../src/db/career-shared'
import { db } from '../../../../src/db/client'
import { saveRecordExtensions } from '../../../../src/lib/career/extensions'
import {
  type CandidateFormValues,
  candidateFormSchema,
  candidateFormValues,
  candidateInput,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { CareerOnboardingRegion } from '../../../components/career/CareerOnboardingRegion'
import { IdentityForm, identityFormRootId } from '../../../components/career/IdentityForm'
import { IdentityPanel } from '../../../components/career/IdentityPanel'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

/**
 * Saves the identity and its preserved extension fields, returning whether
 * anything really changed. No-op writes stay invisible: the repositories do not
 * bump a revision, and the flash says so.
 */
function saveIdentity(values: CandidateFormValues): boolean {
  const saved = saveCareerCandidate(db, candidateInput(values), {
    expectedRevision: values.expectedRevision,
  })
  // The preserved fields live on the profile singleton row the save above
  // guarantees, so this write always addresses a real row.
  const extensionsChanged = saveRecordExtensions(db, 'candidate', '$', values.extensionFields)
  return saved.changed || extensionsChanged
}

/**
 * Identity editor. The candidate is a singleton: the form always carries its
 * expected revision, identity and its preserved extension fields are saved
 * together, and a stale submit returns the same form fragment with a 409.
 */
export const GET = createRoute((c) => {
  const view = loadCareerDataView(db)
  return c.html(
    <IdentityForm
      values={candidateFormValues(view.candidate, view.candidateExtensions)}
      exists={view.candidate !== null}
    />,
  )
})

export const POST = createRoute(async (c) => {
  const view = loadCareerDataView(db)
  const exists = view.candidate !== null
  const fallback = candidateFormValues(view.candidate, view.candidateExtensions)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(<IdentityForm values={submitted} exists={exists} feedback={feedback} />, status)

  const parsed = candidateFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, identityFormRootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, identityFormRootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  let changed = false
  try {
    changed = saveIdentity(parsed.data)
  } catch (error) {
    if (error instanceof CareerRevisionConflictError) {
      retargetFragment(c, identityFormRootId)
      return render({ conflict: true }, 409)
    }
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, identityFormRootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const updated = loadCareerDataView(db)
  return c.html(
    <>
      <IdentityForm
        values={candidateFormValues(updated.candidate, updated.candidateExtensions)}
        exists
      />
      <IdentityPanel candidate={updated.candidate} extensions={updated.candidateExtensions} oob />
      <CareerOnboardingRegion onboardingRequired={updated.onboardingRequired} oob />
      <CareerDataTabs activeTab="identity" oob />
      <FlashMessage autoDismiss>{changed ? 'Identity saved.' : 'No changes to save.'}</FlashMessage>
    </>,
  )
})
