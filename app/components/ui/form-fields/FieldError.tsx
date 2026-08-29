import type { Child } from 'hono/jsx'

export function FieldError({ id, children }: { id: string; children: Child }) {
  return (
    <p id={id} class="label text-error" role="alert">
      {children}
    </p>
  )
}
