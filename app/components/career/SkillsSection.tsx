import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerSkillRecord } from '../../../src/db/career-skills'
import { PersonalSkillList } from './PersonalSkillList'
import { SkillCatalogList } from './SkillCatalogList'
import { type SkillView, SkillViewTabs } from './SkillViewTabs'

/**
 * Skills tab. "My skills" holds the candidate's own claims with an editor
 * region outside the list root (so a save keeps the open form while the list
 * refreshes out of band); "Catalog" shows the approved vocabulary read-only. The
 * two views are separate, and neither creates the other.
 */
export function SkillsSection({
  view,
  personalSkills,
  catalogSkills,
  includeRetired,
}: {
  view: SkillView
  personalSkills: CareerSkillRecord[]
  catalogSkills: CareerCatalogSkill[]
  includeRetired: boolean
}) {
  return (
    <div class="space-y-4">
      <SkillViewTabs activeView={view} includeRetired={includeRetired} />
      {view === 'catalog' ? (
        <SkillCatalogList catalogSkills={catalogSkills} personalSkills={personalSkills} />
      ) : (
        <>
          <div id="career-skills-editor" aria-live="polite"></div>
          <PersonalSkillList personalSkills={personalSkills} includeRetired={includeRetired} />
        </>
      )}
    </div>
  )
}
