import type { Child } from 'hono/jsx'

/**
 * Wraps candidate-authored narrative text (evidence notes, evidence narratives,
 * safe wording, limitations, self-attested skill evidence). The notice keeps it
 * structurally and visually distinct from the validated source links above, so
 * a narrative is never mistaken for a checked source: it is the candidate's own
 * account and never counts as independently verified evidence.
 */
export function NarrativeAttestationFields({
  id,
  title = 'Narrative attestation',
  children,
}: {
  id: string
  title?: string
  children: Child
}) {
  return (
    <fieldset class="fieldset">
      <legend class="fieldset-legend">{title}</legend>
      <div role="note" class="alert alert-info items-start">
        <p class="text-sm">
          Your own account, stored as narrative attestation and kept separate from validated source
          links. It is never treated as independently verified evidence on its own.
        </p>
      </div>
      <div class="mt-2 space-y-1">{children}</div>
    </fieldset>
  )
}
