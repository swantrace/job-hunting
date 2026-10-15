import { createRoute } from 'honox/factory'
import { CareerReferenceError } from '../../../../src/db/career-shared'
import { db } from '../../../../src/db/client'
import type { Filters } from '../../../../src/db/queries'
import { getApplication, type JobCardData } from '../../../../src/db/queries'
import {
  CatalogSkillConflictError,
  createCatalogSkill,
  createSkillTerm,
  loadAnalysisMapping,
  loadMentionContext,
  rememberMentionAlias,
  saveMentionMapping,
  searchApprovedCatalog,
} from '../../../../src/db/skill-mapping-service'
import { resetMention, skipMention } from '../../../../src/db/skill-mentions'
import { listRunSkillReviews } from '../../../../src/db/skill-queries'
import { getApplicationReadiness } from '../../../../src/lib/application-readiness'
import { getCandidateAnalysisState } from '../../../../src/lib/candidate-analysis'
import { careerSkillEvidenceMap } from '../../../../src/lib/career/canonical-data'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { skillCategoryDefinitions } from '../../../../src/lib/skills/taxonomy'
import { computeWorkspaceAvailability } from '../../../../src/lib/workspace/availability'
import { tabAvailability } from '../../../../src/lib/workspace/state'
import { CreateSkillForm } from '../../../components/workspace/CreateSkillForm'
import { query } from '../../../components/workspace/helpers'
import { ReviewReadiness } from '../../../components/workspace/ReviewReadiness'
import { SkillMentionRow } from '../../../components/workspace/SkillMentionRow'
import { SkillReviewPanel } from '../../../components/workspace/SkillReviewPanel'
import { WorkspaceTabs } from '../../../components/workspace/WorkspaceTabs'

/**
 * Review mapping mutations: map, skip, unmap, remember-alias and create-skill.
 *
 * The HTMX contract mirrors `skill-decisions.tsx`: a success returns the stable
 * `#skill-review-panel` fragment plus intentional OOB fragments for the
 * workspace tabs and document readiness, so the active Review tab and adjacent
 * Contact/Activity content are preserved. A validation failure returns only the
 * smallest affected form with `HX-Retarget` and status 422. A forged, foreign or
 * already-merged id is a safe 404/409 and never writes.
 */

function reviewPanelFragment(
  job: JobCardData,
  filters: Filters,
  jobPostingAnalysisId: number | null,
) {
  const state = getCandidateAnalysisState(job.id)
  const runId = state.currentCompleted?.id ?? state.latestCompleted?.id ?? null
  return (
    <SkillReviewPanel
      job={job}
      filters={filters}
      requirements={runId ? listRunSkillReviews(runId) : []}
      careerEvidence={careerSkillEvidenceMap()}
      mapping={loadAnalysisMapping(db, jobPostingAnalysisId)}
      categories={skillCategoryDefinitions()}
      searchCatalog={(term, limit) => searchApprovedCatalog(db, term, limit)}
      canMap={jobPostingAnalysisId !== null}
      canDecide={state.state === 'current' && !!state.currentCompleted}
    />
  )
}

function completedMappingFragments(
  job: JobCardData,
  filters: Filters,
  jobPostingAnalysisId: number | null,
) {
  return (
    <>
      {reviewPanelFragment(job, filters, jobPostingAnalysisId)}
      <WorkspaceTabs
        activeTab="review"
        availability={tabAvailability(computeWorkspaceAvailability(job.id))}
        oob
      />
      <ReviewReadiness
        jobId={job.id}
        filters={filters}
        readiness={getApplicationReadiness(job.id)}
        oob
      />
    </>
  )
}

function mentionRowFragment(job: JobCardData, filters: Filters, mentionId: number, error: string) {
  const mapping = loadAnalysisMapping(
    db,
    loadMentionContext(mentionId)?.jobPostingAnalysisId ?? null,
  )
  const row = mapping.mentions.find((mention) => mention.id === mentionId)
  if (!row) return null
  return (
    <SkillMentionRow
      jobId={job.id}
      row={row}
      filters={filters}
      suggestions={searchApprovedCatalog(db, row.rawTerm, 5)}
      canDecide
      mapError={error}
    />
  )
}

function createSkillFormFragment(
  job: JobCardData,
  filters: Filters,
  fields: { term: string; category: string | null; mentionId: number | null },
  errors?: { name?: string; category?: string },
) {
  return (
    <CreateSkillForm
      categories={skillCategoryDefinitions()}
      action={`/applications/${job.id}/skill-mentions?${query(filters)}&workspaceTab=review`}
      term={fields.term}
      selectedCategory={fields.category}
      mentionId={fields.mentionId}
      errors={errors}
    />
  )
}

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  const raw = await parseForm(c)
  const action = raw.action
  const mentionId = parseId(raw.mentionId)
  const context = mentionId ? loadMentionContext(mentionId) : null
  const owns = !!context && context.jobApplicationId === id

  try {
    if (action === 'create-skill') {
      const created = createCatalogSkill(db, {
        name: raw.name ?? '',
        category: raw.category ?? null,
      })
      if (owns && context) saveMentionMapping(db, context.mentionId, created)
      return c.html(completedMappingFragments(job, filters, context?.jobPostingAnalysisId ?? null))
    }

    if (action === 'map') {
      if (!owns || !context)
        return c.html(<div class="alert alert-error">Skill mention not found.</div>, 404)
      const skillId = parseId(raw.skillId)

      if (!skillId) {
        const newSkillTerm = createSkillTerm(raw.skillId)
        if (newSkillTerm) {
          // The user asked for a catalog entry that does not exist yet; hand
          // over to the explicit create form instead of inventing a mapping.
          c.header('HX-Retarget', '#create-skill-form')
          return c.html(
            createSkillFormFragment(job, filters, {
              term: newSkillTerm,
              category: null,
              mentionId: context.mentionId,
            }),
            422,
          )
        }
        // Blank selection is never Skip and never a silent mapping.
        c.header('HX-Retarget', `#skill-mention-${context.mentionId}`)
        const row = mentionRowFragment(
          job,
          filters,
          context.mentionId,
          'Choose a catalog skill or use Skip. A blank selection is not a decision.',
        )
        if (!row) return c.html(<div class="alert alert-error">Skill mention not found.</div>, 404)
        return c.html(row, 422)
      }

      // The service re-validates the id against the catalog and refuses a
      // forged, merged or not-approved target with a reference error.
      saveMentionMapping(db, context.mentionId, skillId)
      return c.html(completedMappingFragments(job, filters, context.jobPostingAnalysisId))
    }

    if (action === 'skip' || action === 'unmap') {
      if (!owns || !context)
        return c.html(<div class="alert alert-error">Skill mention not found.</div>, 404)
      if (action === 'skip') skipMention(db, context.mentionId)
      else resetMention(db, context.mentionId)
      return c.html(completedMappingFragments(job, filters, context.jobPostingAnalysisId))
    }

    if (action === 'remember-alias') {
      if (!owns || !context)
        return c.html(<div class="alert alert-error">Skill mention not found.</div>, 404)
      rememberMentionAlias(db, context.mentionId, raw.alias ?? '')
      return c.html(completedMappingFragments(job, filters, context.jobPostingAnalysisId))
    }

    c.header('HX-Retarget', '#skill-review-panel')
    return c.html(<div class="alert alert-error">Unknown mapping action.</div>, 422)
  } catch (error) {
    if (error instanceof CatalogSkillConflictError) {
      c.header('HX-Retarget', '#create-skill-form')
      return c.html(
        createSkillFormFragment(
          job,
          filters,
          {
            term: raw.name ?? '',
            category: raw.category ?? null,
            mentionId: context?.mentionId ?? null,
          },
          {
            name: error.field === 'category' ? undefined : error.message,
            category: error.field === 'category' ? error.message : undefined,
          },
        ),
        422,
      )
    }
    if (error instanceof CareerReferenceError) {
      if (!context)
        return c.html(<div class="alert alert-error">Skill mention not found.</div>, 404)
      c.header('HX-Retarget', `#skill-mention-${context.mentionId}`)
      const row = mentionRowFragment(job, filters, context.mentionId, error.message)
      if (!row) return c.html(<div class="alert alert-error">Skill mention not found.</div>, 404)
      return c.html(row, 422)
    }
    throw error
  }
})
