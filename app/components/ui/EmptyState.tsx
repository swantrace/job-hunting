import type { Child } from 'hono/jsx'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: Child
}) {
  return (
    <div class="py-10 text-center">
      <h3 class="font-semibold">{title}</h3>
      {description ? <p class="mt-1 text-sm text-base-content/60">{description}</p> : null}
      {action ? <div class="mt-4">{action}</div> : null}
    </div>
  )
}
