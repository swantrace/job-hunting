import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import { listCareerProjects, updateCareerProject } from '../../../../../src/db/career-records'
import {
  CareerReferenceError,
  CareerRevisionConflictError,
} from '../../../../../src/db/career-state'
import { db } from '../../../../../src/db/client'
import {
  projectFormSchema,
  projectFormValues,
  projectInput,
  submittedValues,
} from '../../../../../src/lib/career/form-input'
import { parseForm, parseId, queryFlag, retargetFragment } from '../../../../../src/lib/request'
import { CareerDataTabs } from '../../../../components/career/CareerDataTabs'
import { ProjectForm, projectFormRootId } from '../../../../components/career/ProjectForm'
import { ProjectList } from '../../../../components/career/ProjectList'
import type { CareerFormFeedback } from '../../../../components/career/types'
import { FlashMessage } from '../../../../components/responses/FlashMessage'

function findProject(id: number | null) {
  return id === null
    ? undefined
    : listCareerProjects(db, { includeRetired: true }).find((row) => row.id === id)
}

export const GET = createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findProject(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <ProjectForm
      values={projectFormValues(record)}
      recordId={record.id}
      stableKey={record.stableKey}
      includeRetired={includeRetired}
      experiences={view.referenceExperiences}
      directions={view.referenceDirections}
      catalogSkills={view.catalogSkills}
    />,
  )
})

/**
 * Updates one project with the revision the form was rendered with, so a stale
 * submit is a 409 fragment (with a reload action) instead of a lost update. The
 * stable key is taken from the stored record and cannot change.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = findProject(parseId(c.req.param('id')))
  if (!record) return c.text('Not found.', 404)
  const view = loadCareerDataView(db, { includeRetired })
  const rootId = projectFormRootId(record.id)
  const fallback = projectFormValues(record)
  const raw = await parseForm(c)
  const submitted = submittedValues(raw, fallback)
  const render = (feedback?: CareerFormFeedback, status: 200 | 409 | 422 = 200) =>
    c.html(
      <ProjectForm
        values={submitted}
        recordId={record.id}
        stableKey={record.stableKey}
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
  if (parsed.data.expectedRevision === undefined) {
    retargetFragment(c, rootId)
    return render({ message: 'Reload this form and try again.' }, 422)
  }

  try {
    updateCareerProject(db, record.id, projectInput(parsed.data, { stableKey: record.stableKey }), {
      expectedRevision: parsed.data.expectedRevision,
    })
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
  const updated = refreshed.projects.find((row) => row.id === record.id) ?? record
  return c.html(
    <>
      <ProjectForm
        values={projectFormValues(updated)}
        recordId={updated.id}
        stableKey={updated.stableKey}
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
      <FlashMessage autoDismiss>Project saved.</FlashMessage>
    </>,
  )
})
