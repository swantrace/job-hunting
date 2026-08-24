import type { Child } from 'hono/jsx'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: Child
}) {
  return (
    <header class="mb-5">
      <h1 class="text-3xl font-bold">{title}</h1>
      {description ? <p class="mt-1 text-base-content/60">{description}</p> : null}
      {actions ? <div class="mt-3">{actions}</div> : null}
    </header>
  )
}
