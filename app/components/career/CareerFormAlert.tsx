import type { Child } from 'hono/jsx'

/**
 * Form-level feedback inside a career form fragment. A stale revision (409) is
 * shown here with the reload action; it never replaces the page.
 */
export function CareerFormAlert({
  tone = 'error',
  title,
  children,
}: {
  tone?: 'error' | 'warning' | 'info' | 'success'
  title: string
  children?: Child
}) {
  return (
    <div role="alert" class={`alert alert-${tone} items-start`}>
      <div>
        <p class="font-semibold">{title}</p>
        {children ? <div class="mt-1 text-sm">{children}</div> : null}
      </div>
    </div>
  )
}
