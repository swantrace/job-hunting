import {
  type ApprovedBaseResume,
  baseResumesDirectory,
  listApprovedBaseResumes,
} from '../../src/lib/base-resumes'
import { listProfiles } from '../../src/lib/profiles'

export function BaseResumeStatus() {
  const profiles = listProfiles()
  let approved: ApprovedBaseResume[] = []
  let error: string | null = null
  try {
    approved = listApprovedBaseResumes(
      baseResumesDirectory(),
      new Set(profiles.map((profile) => profile.id)),
    )
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Unable to read Base Resumes.'
  }
  const byDirection = new Map(approved.map((resume) => [resume.direction, resume]))
  return (
    <section class="card border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body">
        <div>
          <h2 class="card-title">Approved Base Resumes</h2>
          <p class="text-sm text-base-content/60">
            Private Markdown starting points per direction. A missing resume disables document
            generation for that direction only — never a blank fallback.
          </p>
        </div>
        {error ? (
          <div class="alert alert-error text-sm" role="alert">
            <span>{error}</span>
          </div>
        ) : null}
        <ul class="mt-2 space-y-2">
          {profiles.map((profile) => {
            const resume = byDirection.get(profile.id)
            return (
              <li class="rounded-box bg-base-200 p-3 text-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <strong>{profile.label}</strong>
                  <span class="badge badge-outline badge-sm">{profile.id}</span>
                  {resume ? (
                    <>
                      <span class="badge badge-success badge-sm">version {resume.version}</span>
                      <span class="text-base-content/60">approved {resume.approvedAt}</span>
                      {resume.stale ? (
                        <span class="badge badge-warning badge-sm">stale — file changed</span>
                      ) : null}
                      <details class="mt-2 w-full">
                        <summary class="cursor-pointer font-semibold">View content</summary>
                        <pre class="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed">
                          {resume.text}
                        </pre>
                      </details>
                    </>
                  ) : (
                    <span class="badge badge-sm">Not approved</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
