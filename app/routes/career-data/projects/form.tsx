import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { createCareerProject, listCareerProjects } from '../../../../src/db/career-records'
import { CareerReferenceError } from '../../../../src/db/career-shared'
import { db } from '../../../../src/db/client'
import {
  careerStableKey,
  projectFormSchema,
  projectFormValues,
  projectInput,
  submittedValues,
} from '../../../../src/lib/career/form-input'
import { parseForm, queryFlag, retargetFragment } from '../../../../src/lib/request'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { ProjectForm, projectFormRootId } from '../../../components/career/ProjectForm'
import { ProjectList } from '../../../components/career/ProjectList'
import type { CareerFormFeedback } from '../../../components/career/types'
import { FlashMessage } from '../../../components/responses/FlashMessage'

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <ProjectForm
      values={projectFormValues(null)}
      recordId={null}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      directions={view.referenceDirections}
      catalogSkills={view.catalogSkills}
    />,
  )
})

/**
 * Creates one project. The stable key is generated (never typed) and stays the
 * record identity when the display fields are renamed. A save returns the new
 * edit form plus the refreshed list and tabs as top-level OOB siblings.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = projectFormRootId(null)
  const fallback = projectFormValues(null)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 422 = 200) =>
    c.html(
      <ProjectForm
        values={submitted}
        recordId={null}
        includeRetired={includeRetired}
        feedback={feedback}
        experiences={view.referenceExperiences}
        directions={view.referenceDirections}
        catalogSkills={view.catalogSkills}
      />,
      status,
    )

  const parsed = projectFormSchema.safeParse(raw)
  if (!parsed.success) {
    retargetFragment(c, rootId)
    return render({ errors: parsed.error.flatten().fieldErrors }, 422)
  }

  let createdId: number
  try {
    const stableKey = careerStableKey(
      [parsed.data.name],
      listCareerProjects(db, { includeRetired: true }).map((row) => row.stableKey),
    )
    createdId = createCareerProject(db, projectInput(parsed.data, { stableKey })).id
  } catch (error) {
    if (error instanceof CareerReferenceError) {
      retargetFragment(c, rootId)
      return render({ message: error.message }, 422)
    }
    throw error
  }

  const refreshed = loadCareerDataView(db, { includeRetired })
  const record = refreshed.projects.find((row) => row.id === createdId)
  if (!record) return c.text('Not found.', 404)
  return c.html(
    <>
      <ProjectForm
        values={projectFormValues(record)}
        recordId={record.id}
        stableKey={record.stableKey}
        includeRetired={includeRetired}
        experiences={refreshed.referenceExperiences}
        directions={refreshed.referenceDirections}
        catalogSkills={refreshed.catalogSkills}
      />
      <ProjectList
        projects={refreshed.projects}
        includeRetired={includeRetired}
        experiences={refreshed.allExperiences}
        catalogSkills={refreshed.catalogSkills}
        directions={refreshed.allDirections}
        oob
      />
      <CareerDataTabs activeTab="projects" oob />
      <FlashMessage autoDismiss>Project added.</FlashMessage>
    </>,
  )
})
