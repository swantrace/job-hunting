import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerExperienceRecord, CareerProjectRecord } from '../../../src/db/career-records'
import { ProjectList } from './ProjectList'

/**
 * Projects tab: the editor region sits outside the list root so a save keeps the
 * open form while the list refreshes out of band, and retire returns the list
 * fragment only.
 */
export function ProjectSection({
  projects,
  includeRetired,
  experiences,
  catalogSkills,
  directions,
}: {
  projects: CareerProjectRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  catalogSkills: CareerCatalogSkill[]
  directions: CareerDirectionRecord[]
}) {
  return (
    <div class="space-y-4">
      <div id="career-projects-editor" aria-live="polite"></div>
      <ProjectList
        projects={projects}
        includeRetired={includeRetired}
        experiences={experiences}
        catalogSkills={catalogSkills}
        directions={directions}
      />
    </div>
  )
}
