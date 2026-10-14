import { createRoute } from 'honox/factory'
import { createCareerEducation, listCareerEducation } from '../../../../src/db/career-records'
import {
  CareerReferenceError,
  readCareerStateDocuments,
  writeCareerStateDocuments,
} from '../../../../src/db/career-state'
import { db } from '../../../../src/db/client'
import {
  applyExtensionFields,
  careerStableKey,
  educationFormSchema,
  educationFormValues,
  educationInput,
  parseExtensionLines,
  resolveFieldValue,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { extensionObjectOrNull } from '../../../../src/lib/career/json-schemas'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { EducationForm, educationFormRootId } from '../../../components/career/EducationForm'
import { EducationList } from '../../../components/career/EducationList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

/** One entry point for every education record, active or retired. */
function allEducation() {
  return listCareerEducation(db, { includeRetired: true })
}

function storedExtensions(stableKey: string): Record<string, unknown> | null {
  return extensionObjectOrNull(readCareerStateDocuments(db).records.education?.[stableKey])
}

/** Preserved extension fields live in the career state store, by stable key. */
function saveExtensions(stableKey: string, text: string | undefined): boolean {
  const extension = parseExtensionLines(storedExtensions(stableKey), text)
  return writeCareerStateDocuments(db, {
    records: applyExtensionFields(
      readCareerStateDocuments(db).records,
      'education',
      stableKey,
      extension,
    ),
  })
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  return c.html(
    <EducationForm
      values={educationFormValues(null, null, null)}
      recordId={null}
      includeRetired={includeRetired}
    />,
  )
})

/**
 * Creates one education record. The stable key is generated (never typed) and
 * stays the record identity when the degree or school is renamed later.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const rootId = educationFormRootId(null)
  const fallback = educationFormValues(null, null, null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <EducationForm
        values={submitted}
        recordId={null}
        includeRetired={includeRetired}
        feedback={feedback}
      />,
      status,
    )

  const parsed = educationFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }

  let createdId: number
  let stableKey: string
  try {
    stableKey = careerStableKey(
      [parsed.data.school, parsed.data.degree],
      allEducation().map((row) => row.stableKey),
    )
    createdId = createCareerEducation(
      db,
      educationInput(parsed.data, {
        stableKey,
        details: resolveFieldValue(null, parsed.data.details),
      }),
    ).id
    saveExtensions(stableKey, parsed.data.extensionFields)
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const record = allEducation().find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <EducationForm
        values={educationFormValues(record, record.details, storedExtensions(record.stableKey))}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
      />
      <EducationList
        education={listCareerEducation(db, { includeRetired })}
        includeRetired={includeRetired}
        oob
      />
      <CareerDataTabs activeTab="education" oob />
      <FlashMessage autoDismiss>Education added.</FlashMessage>
    </>,
  )
})
