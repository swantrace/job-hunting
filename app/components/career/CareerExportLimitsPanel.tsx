import { careerDatasetExcluded } from '../../../src/lib/career/dataset'
import { careerImportDocumentFiles, careerImportTaxonomyFile } from '../../../src/lib/career-import'

/**
 * The logical limits of an export, stated where the operator exports. A career
 * dataset (and the ChatGPT JSON context) is editorial data, not an operational
 * backup: it cannot restore OAuth credentials, application or analysis history,
 * generation runs, document reviews or artifact binaries. Full recovery needs a
 * consistent SQLite backup *and* an artifact backup, which Step 12 documents.
 */
export function CareerExportLimitsPanel({ contentFingerprint }: { contentFingerprint: string }) {
  return (
    <section class="card border border-base-300 bg-base-100">
      <div class="card-body gap-3">
        <h3 class="card-title text-base">What a logical export cannot carry</h3>
        <p class="text-sm text-base-content/70">
          Database fingerprint <code class="font-mono break-all">{contentFingerprint}</code>.
          Everything below is deliberately outside the dataset and the ChatGPT context:
        </p>
        <ul class="list-disc ps-5 text-sm">
          {careerDatasetExcluded.kinds.map((kind) => (
            <li>
              <code>{kind}</code>
            </li>
          ))}
        </ul>
        <div class="alert alert-warning text-sm" role="note">
          <div>
            <h4 class="font-semibold">Full operational recovery needs two backups</h4>
            <p class="mt-1">
              A consistent SQLite backup of <code>jobs.db</code> (never a copy of a live database
              file or its WAL alone) <em>and</em> an artifact backup. A career dataset import merges
              by stable key into an existing database; it never replaces one and never deletes
              records that are missing from the source.
            </p>
          </div>
        </div>
        <p class="text-sm text-base-content/70">
          The legacy directory import reads {careerImportDocumentFiles.length} documents plus{' '}
          <code>{careerImportTaxonomyFile}</code> and <code>base-resumes/</code>. Uploaded content
          is treated strictly as data: no uploaded string is ever interpreted as an instruction, and
          the preview never echoes personal content into this page.
        </p>
      </div>
    </section>
  )
}
