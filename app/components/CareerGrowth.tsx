import type { CareerGrowthLabel, CareerGrowthOpportunity } from '../../src/lib/career-growth'

const labelClass: Record<CareerGrowthLabel, string> = {
  'Verify existing evidence': 'badge-warning',
  'Consider learning/project evidence': 'badge-info',
  'Low priority': 'badge-ghost',
}

export function CareerGrowthList({ opportunities }: { opportunities: CareerGrowthOpportunity[] }) {
  if (!opportunities.length)
    return (
      <p
        id="career-growth-list"
        class="rounded-box border border-base-300 p-4 text-sm text-base-content/60"
      >
        No recurring evidence gaps across active applications yet.
      </p>
    )
  return (
    <ul id="career-growth-list" class="space-y-3">
      {opportunities.map((opportunity) => (
        <li key={opportunity.skillKey} class="rounded-box border border-base-300 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <strong>{opportunity.skillName}</strong>
            <span class="badge badge-outline badge-sm">{opportunity.skillKey}</span>
            <span class={`badge badge-sm ${labelClass[opportunity.label]}`}>
              {opportunity.label}
            </span>
            {opportunity.category ? (
              <span class="badge badge-outline badge-sm">{opportunity.category}</span>
            ) : null}
          </div>
          <p class="mt-1 text-sm text-base-content/70">
            {opportunity.activeApplicationCount} active application
            {opportunity.activeApplicationCount === 1 ? '' : 's'} · {opportunity.directionCount}{' '}
            direction{opportunity.directionCount === 1 ? '' : 's'} · required{' '}
            {opportunity.requiredCount} · preferred {opportunity.preferredCount} · mentioned{' '}
            {opportunity.mentionedCount}
          </p>
          <p class="mt-1 text-xs text-base-content/60">
            Verified evidence {opportunity.verifiedEvidenceCount} · retained{' '}
            {opportunity.retainedCount} · latest activity {opportunity.latestActivityAt}
          </p>
        </li>
      ))}
    </ul>
  )
}
