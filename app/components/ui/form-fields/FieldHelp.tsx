import type { Child } from 'hono/jsx'

export function FieldHelp({ id, children }: { id: string; children: Child }) {
  return (
    <p id={id} class="label">
      {children}
    </p>
  )
}
