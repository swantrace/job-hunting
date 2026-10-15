import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerPortfolioTopicRecord,
  CareerProjectRecord,
} from '../../../src/db/career-records'
import { PortfolioList } from './PortfolioList'

/**
 * Portfolio tab: the editor region sits outside the list root so a save keeps
 * the open form while the list refreshes out of band, and retire returns the
 * list fragment only.
 */
export function PortfolioSection({
  topics,
  includeRetired,
  projects,
  directions,
}: {
  topics: CareerPortfolioTopicRecord[]
  includeRetired: boolean
  projects: CareerProjectRecord[]
  directions: CareerDirectionRecord[]
}) {
  return (
    <div class="space-y-4">
      <div id="career-portfolio-editor" aria-live="polite"></div>
      <PortfolioList
        topics={topics}
        includeRetired={includeRetired}
        projects={projects}
        directions={directions}
      />
    </div>
  )
}
