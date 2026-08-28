import type { Child } from 'hono/jsx'

export function FlashMessage({
  children,
  tone = 'success',
  autoDismiss = false,
}: {
  children: Child
  tone?: 'success' | 'error' | 'warning' | 'info'
  autoDismiss?: boolean
}) {
  return (
    <div id="flash" hx-swap-oob="innerHTML">
      <div
        class={`alert alert-${tone}`}
        {...(autoDismiss ? { 'data-flash-autodismiss': 'true' } : {})}
      >
        {children}
      </div>
    </div>
  )
}
