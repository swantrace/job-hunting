import type { Filters, JobCardData } from '../../src/db/queries'
import type { JobStatus } from '../../src/db/schema'
import { Board, Metrics, QuickCollect } from './Dashboard'

export function MutationResponse({
  jobs,
  filters,
  values,
  resetQuick = false,
}: {
  jobs: JobCardData[]
  filters: Filters
  values: Partial<Record<JobStatus, number>>
  resetQuick?: boolean
}) {
  return (
    <>
      {resetQuick && <QuickCollect filters={filters} />}
      {resetQuick ? (
        <Board jobs={jobs} filters={filters} oob />
      ) : (
        <Board jobs={jobs} filters={filters} />
      )}
      <Metrics values={values} oob />
    </>
  )
}
