import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { saveCareerPreferences } from '../../../../src/db/career-facts'
import { CareerRevisionConflictError } from '../../../../src/db/career-state'
import { db } from '../../../../src/db/client'
import { saveRecordExtensions } from '../../../../src/lib/career/extensions'
import {
  preferencesFormSchema,
  preferencesFormValues,
  preferencesInput,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { extensionObjectOrNull } from '../../../../src/lib/career/json-schemas'
import { parseForm, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { CareerOnboardingRegion } from '../../../components/career/CareerOnboardingRegion'
import { PreferencesForm, preferencesFormRootId } from '../../../components/career/PreferencesForm'
import { PreferencesPanel } from '../../../components/career/PreferencesPanel'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const view = loadCareerDataView(db)
  return c.html(
    <PreferencesForm
      values={preferencesFormValues(view.preferences, view.extensionRecords.preferences?.['$'])}
      exists={view.preferences !== null}
    />,
  )
})

/**
 * Saves the preferences singleton, returning whether anything really changed so
 * a no-op write stays invisible. A stale submit is a 409 fragment and a
 * validation failure a 422 fragment, each returning only this form.
 */
export const POST = createRoute(async (c) => {
  const view = loadCareerDataView(db)
  const exists = view.preferences !== null
  const fallback = preferencesFormValues(view.preferences, view.extensionRecords.preferences?.['$'])
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(<PreferencesForm values={submitted} exists={exists} feedback={feedback} />, status)

  const parsed = preferencesFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, preferencesFormRootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, preferencesFormRootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  let changed = false
  try {
    const saved = saveCareerPreferences(
      db,
      preferencesInput(parsed.data, {
        compensation: view.preferences?.compensation ?? null,
      }),
      { expectedRevision: parsed.data.expectedRevision },
    )
    const extensionsChanged = saveRecordExtensions(
      db,
      'preferences',
      '$',
      parsed.data.extensionFields,
    )
    changed = saved.changed || extensionsChanged
  } catch (error) {
    if (error instanceof CareerRevisionConflictError) {
      retargetFragment(c, preferencesFormRootId)
      return render({ conflict: true }, 409)
    }
    throw error
  }

  const updated = loadCareerDataView(db)
  return c.html(
    <>
      <PreferencesForm
        values={preferencesFormValues(
          updated.preferences,
          updated.extensionRecords.preferences?.['$'],
        )}
        exists={updated.preferences !== null}
      />
      <PreferencesPanel
        preferences={updated.preferences}
        extensions={extensionObjectOrNull(updated.extensionRecords.preferences?.['$'])}
        oob
      />
      <CareerOnboardingRegion onboardingRequired={updated.onboardingRequired} oob />
      <CareerDataTabs activeTab="preferences" oob />
      <FlashMessage autoDismiss>
        {changed ? 'Preferences saved.' : 'No changes to save.'}
      </FlashMessage>
    </>,
  )
})
