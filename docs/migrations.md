# Database migration, backup, and recovery runbook

This document is the operational checklist for changing the SQLite schema and
for moving legacy filesystem career data into the database. It describes the
current process rather than individual historical tables; the migration files
themselves are the record of schema history.

Deployment is manual and deliberate: pushing or merging to `main` runs CI but
does **not** deploy. Nothing in this runbook is executed by the Harness; an
operator runs it.

## Sources of truth

- `src/db/schema.ts` defines the current Drizzle schema.
- `drizzle/*.sql` contains ordered, immutable database migrations.
- `drizzle/meta/_journal.json` records their execution order.
- `src/db/migrate.ts` (`bun run db:migrate`) applies pending migrations.
- `jobs.db` (or `DB_FILE_NAME`) owns applications, postings, analyses,
  requirements, mentions, career facts, directions, categories, personal skills,
  Base Resume versions, and the operational skill catalog.
- A legacy `career-data/` directory (`*.json`, `skill-taxonomy.json`,
  `base-resumes/`) is an **import-only** source. It is never read at runtime and
  is never synchronized automatically. Load it through the browser flow at
  `/career-data/transfer`, which previews the change set (source fingerprint,
  database fingerprint, per-kind counts, conflicts) and then applies it in one
  transaction after confirmation.

`bun run start` applies schema migrations only. No boot path runs a file
synchronizer, even when a career-data directory is mounted.

## Runtime behavior

The production start command performs these operations in order:

```text
db:migrate -> start server
```

A migration failure prevents the server from starting and must never be handled
by deleting the production database. Import and export are browser flows under
`/career-data/transfer`, so there is no command-line path that could open
production data by accident.

`src/db/health.ts` runs at boot before the server accepts requests. If any
canonical table or migration-added column is missing it fails fast with a
readable message naming the missing object, for example:

```text
Database schema is missing required table(s): career_profile, career_record_directions, ...
Run the database migrations (bun run db:migrate) before starting the server.
```

An empty but fully migrated database is healthy: the app renders the Career Data
onboarding state and does not crash.

The Fly deployment uses these persistent paths:

```text
/data/jobs.db
/data/bunqueue.db
/data/artifacts/
/data/career-data/     # import-only legacy files
```

A database backup covers only `jobs.db`. Back up generated artifacts, queued
work and legacy career-data files separately when a complete environment
snapshot is required.

### Running commands on the machine

`fly ssh console` **without** `-C` opens a real shell, so multi-line scripts,
`cd`, pipes and globs all work there. `fly ssh console -C '<command>'` does **not**
use a shell — it execs the words directly, so `cd /app && ...`, pipes, `;` and
globs fail with `exec: "cd": executable file not found in $PATH`. Wrap those:

```sh
fly ssh console -a job-hunting -C 'sh -c "cd /data && ls -lh jobs.db*"'
```

For multi-line probes, prefer an interactive console and paste the script.

## Creating a migration

1. Change `src/db/schema.ts`.
2. Add the next ordered SQL file under `drizzle/` and its journal entry by hand.
   Migrations in this repository are written deliberately: there is no generator
   script (`bun run db:generate` no longer exists), and DDL that SQLite cannot
   express as a plain `ALTER` is rebuilt explicitly with a copy-and-verify step
   (see step 5).
3. Never edit or reorder a migration that may already have been applied.
4. Keep migrations deterministic and local. They must not call an LLM, make a
   network request, or depend on private career data.
5. For a destructive rebuild, create the replacement table, copy only the data
   that remains valid, verify the copy, and then remove the legacy table.
6. Add tests for both an empty database and a representative populated database.

SQLite cannot alter every constraint in place, so table rebuilds are expected.
Keep foreign keys enabled and explicitly preserve IDs and relationships that are
part of the target design.

## Local validation

Do not use the working `jobs.db` as the first migration test. Create a disposable
database and run the same entry point used in production:

```sh
rm -f /tmp/job-tracker-migration.db*
DB_FILE_NAME=/tmp/job-tracker-migration.db bun run db:migrate
```

Then run the repository checks:

```sh
bun run format:check
bun run typecheck
bun test
bun run build
git diff --check
```

To test migration from existing data, make a backup, copy that backup to a
disposable path, and point `DB_FILE_NAME` at the copy:

```sh
cp backups/jobs-before-migration.db /tmp/job-tracker-upgrade.db
DB_FILE_NAME=/tmp/job-tracker-upgrade.db bun run db:migrate
```

Inspect important row counts and foreign-key integrity before approving the
migration:

```sh
DB_FILE_NAME=/tmp/job-tracker-upgrade.db bun -e '
  import { Database } from "bun:sqlite";
  const db = new Database(process.env.DB_FILE_NAME, { readonly: true });
  console.log(db.query("PRAGMA foreign_key_check").all());
  console.log(db.query("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name").all("table"));
  db.close();
'
```

`PRAGMA foreign_key_check` must return an empty array.

## Backing up production before deployment

Do this before deploying an image that contains new migrations, and before any
career-data import. Avoid editing applications while the snapshot is created.

Open a console on the currently running Fly machine:

```sh
fly ssh console -a job-hunting
```

Inside the machine, create a consistent standalone SQLite snapshot. Never copy
only a live `.db`/`-wal`/`-shm` file: WAL contents may not be checkpointed, so a
plain `cp jobs.db` can miss committed data. Bun's `Database.serialize()`
includes the committed database state; it is the supported snapshot method:

```sh
mkdir -p /data/backups
export BACKUP="/data/backups/jobs-$(date -u +%Y%m%dT%H%M%SZ).db"
bun -e '
  import { Database } from "bun:sqlite";
  const source = new Database(process.env.DB_FILE_NAME || "/data/jobs.db", { readonly: true });
  await Bun.write(process.env.BACKUP, source.serialize());
  source.close();
  console.log(process.env.BACKUP);
'
```

Record the printed filename, verify it is non-empty, and leave the console:

```sh
ls -lh "$BACKUP"
exit
```

Download an off-machine copy, replacing the timestamp with the value printed
above:

```sh
mkdir -p backups
fly sftp get \
  /data/backups/jobs-YYYYMMDDTHHMMSSZ.db \
  backups/jobs-YYYYMMDDTHHMMSSZ.db \
  --app job-hunting
```

Also back up the artifact tree, which the database snapshot does not contain:

```sh
fly ssh console -a job-hunting
cd /data && tar -czf "/data/backups/artifacts-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" artifacts
ls -lh /data/backups/artifacts-*.tar.gz
exit
```

The local `backups/` directory and SQLite files must remain ignored by Git.

## Fly career-data migration runbook

Use this when the mounted volume still holds the legacy `career-data/` files and
the database must become the runtime authority. This section is documentation;
do not run it during Harness execution. Never overwrite a production `jobs.db`
with local data, and do not import a local dataset into production.

1. **Back up first (consistent snapshot + artifacts).** Follow
   "Backing up production before deployment" above. Do not continue without a
   downloaded, non-empty `jobs-*.db` snapshot and an artifacts archive.
2. **Record the ready baseline.** Note current row counts and health so the
   import cannot silently drop operational data:

   ```sh
   fly ssh console -a job-hunting
   cd /app
   bun -e '
     import { Database } from "bun:sqlite";
     const db = new Database("/data/jobs.db", { readonly: true });
     for (const t of ["job_applications", "companies", "contacts", "job_postings", "generation_runs"])
       console.log(t, db.query(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
     db.close();
   '
   ```

3. **Apply the forward schema migration.** Deploy the new artifact through the
   approved manual deployment flow, or run migrations explicitly in the app
   context. `bun run db:migrate` only moves the schema forward; it never imports
   career files.

   ```sh
   cd /app
   DB_FILE_NAME=/data/jobs.db bun run db:migrate
   ```

   Confirm the health check passes and startup logs report the schema ready.
4. **Bring the volume files to the browser.** Import is a browser flow: open
   `/career-data/transfer`, choose Import, and upload **either** a career dataset
   JSON **or** a zip of the legacy `career-data/` directory. The upload is decoded
   in memory and read strictly as data. To package the volume copy, download it
   first:

   ```sh
   fly sftp get -R /data/career-data ./career-data-volume --app job-hunting
   cd career-data-volume && zip -r ../career-data.zip . && cd ..
   ```

5. **Review the preview.** The preview writes nothing and shows the source
   fingerprint, the database fingerprint, per-kind counts and every conflict. Any
   conflict blocks the whole import; resolve the source or the conflicting record
   and upload again — a stale preview is rejected, so always re-run before
   confirming. Verify the planned inserts/updates match the legacy files and that
   unrelated operational tables are untouched.
6. **Confirm to apply in one transaction.** The confirm step re-reads the same
   bytes and re-derives the fingerprints before writing, and the apply is
   transactional: on any validation error nothing is written.
7. **Verify readiness and counts.** Re-run the count query from step 2 and
   confirm the career tables are populated; an empty `career_profile` means
   onboarding still applies. Check foreign-key integrity:

   ```sh
   cd /app
   bun -e '
     import { Database } from "bun:sqlite";
     const db = new Database("/data/jobs.db", { readonly: true });
     console.log("integrity", db.query("PRAGMA integrity_check").get());
     console.log("fk violations", db.query("PRAGMA foreign_key_check").all());
     for (const t of ["career_profile", "career_experiences", "career_skills", "career_base_resumes", "career_record_directions"])
       console.log(t, db.query(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
     db.close();
   '
   ```

   The operational tables recorded in step 2 are expected to be empty by now; see
   "Cutting over to the database-owned career schema" above.

   Then open the app and confirm: Career Data loads, an approved Base Resume is
   selected per direction, Review resolves requirements, and an existing
   application still shows its Job Post, Documents, Contacts and Activities.
   Drive connection status and confirmed pending uploads must still work.
8. **Retire the file-based environment variables.** No runtime request reads
   `CAREER_DATA_DIR` or `CAREER_BASE_RESUMES_DIR`, so they must not remain in the
   Fly app configuration. `fly.toml` no longer sets `CAREER_DATA_DIR`; if the
   variable is still present as a secret, unset it:

   ```sh
   fly secrets unset CAREER_DATA_DIR --app job-hunting   # only if set as a secret
   ```

   Deploy the change through the normal manual flow. Keep the legacy
   `/data/career-data/` files in place: they are harmless once unused, and they
   are the source you would upload again at `/career-data/transfer`.
9. **Keep the manual deploy policy.** Do not enable automatic deployment, and do
   not deploy again until the checks above pass. If something is wrong, fix
   forward with a new migration or restore the snapshot during a maintenance
   window (see Recovery).

## Cutting over to the database-owned career schema (0026-0029)

This migration set is more than an additive schema change: `0027` deliberately
discards the job-search operational history, so it has to be backed up and
accepted on purpose.

| Migration | Effect |
| --- | --- |
| `0026_career_facts` | Adds the relational career, catalog and mention tables (initially empty). |
| `0027_simplify_schema` | Clears the operational tables (applications, postings, analyses, requirements, mappings, mentions, runs, artifacts, reviews, intake, follow-ups, interviews), folds the baseline pipeline and the 1:1 result/snapshot tables into `generation_runs` (`kind`), merges the two career singletons into `career_profile`, merges five direction junctions into `career_record_directions`, replaces `job_requirements_to_skills` with a view, and drops 12 unusable indexes and two dead columns. |
| `0028_drop_portfolio` | Drops `career_portfolio_topics` and `career_portfolio_topic_projects`. |
| `0029_collapse_career_state` | Drops `career_state`: authored fields without a column move to each row's `extension_json`, document-level values to `career_profile.documents_json`, and the stored version counter becomes a value computed from the data. |
| `0030_drop_orphan_resume_strategies` | Drops `analysis_run_resume_strategies`, an orphan whose creating migration (`0023_run_scoped_resume_strategies`) disappeared when the chain was renumbered. Databases migrated by the older chain still carry it; databases built from the current chain never did, hence `DROP TABLE IF EXISTS`. |

Result: **36 application tables plus the `job_requirements_to_skills` view**.

A database count above 36 means an orphan table survived a removed migration. Before
`0030` the known one was `analysis_run_resume_strategies` (carried by databases
migrated before the chain renumbering); applying `0030` brings such a database to 36.
Consult that table's migration history rather than assuming a failed migration.

Plan for these consequences:

- **The operational history is gone after `0027`.** Record the pre-migration counts
  first (step 2 below) so the backup is meaningful, then expect those tables to be
  empty. Empty is the designed outcome, not a failed import.
- **`start` migrates on boot**, so deploying the image applies the whole set. Code
  and schema ship together: the previous image cannot run against the new schema,
  and the new image cannot start against the old one. **A rollback therefore means
  restoring the database snapshot *and* redeploying the previous image together**;
  an image rollback on its own will not work.
- **Career facts are not part of the migration.** Production career tables are
  empty after `0026`; the owner's facts arrive through the import in the runbook
  below.
- **Never shorten this by uploading a local `jobs.db`.** Beyond being forbidden,
  `google_drive_connections.refresh_token_encrypted` is sealed with a key derived
  from `GOOGLE_OAUTH_STATE_SECRET`; a token encrypted with a different secret
  cannot be decrypted, which silently breaks Drive uploads.

## Production deployment checklist

1. Confirm CI passes on the exact commit being deployed.
2. Create and download the consistent production backup and the artifact archive
   described above.
3. Test pending migrations against a disposable copy of that backup.
4. Trigger the GitHub Actions `workflow_dispatch` deployment from `main`, or run
   the approved manual Fly deployment command. Deployment stays manual.
5. Watch startup logs. `Database migrations applied.` must appear before the
   server starts; the boot health check must not report missing tables.
6. Open the application and verify the critical workflow before allowing new
   writes.

Pushing or merging to `main` runs CI but does not deploy automatically. The
current workflow deploys only when manually triggered with `workflow_dispatch`.

## Post-migration verification

Verify more than whether the home page loads:

1. Check Fly logs for migration, constraint, or missing-table errors.
2. Open Applications, Skills, Companies, Contacts, Career Data and Career
   Documents.
3. After `0027` there is no existing application to open: the operational history
   is discarded on purpose. Confirm instead that Applications, Skills, Companies,
   Contacts, Career Data and Career Documents all load, that career facts render,
   and that an empty workspace shows onboarding guidance rather than an error.
4. Confirm the career tables carry the imported facts, and confirm that the
   operational tables recorded before the cutover are empty by design (the
   `0027` migration discards them).
5. Confirm the schema shape: 36 application tables plus the
   `job_requirements_to_skills` view, and no `career_state` table.
6. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` against the
   production database or a new post-deployment snapshot.
7. Confirm Google Drive connection verification and user-confirmed pending
   uploads still behave correctly.
8. Restart once and confirm the migration step is idempotent and the boot health
   check passes without any career-data directory.

## Recovery

Do not overwrite `jobs.db` while the application has it open. A physical restore
requires a maintenance window in which the application process is stopped and
the Fly volume is mounted by only one machine.

Recovery options, in preferred order:

1. Fix forward with a new migration when existing data is intact and the failure
   is understood.
2. Restore a Fly volume snapshot when the entire volume must return to a known
   state.
3. Restore the downloaded standalone database snapshot during a maintenance
   session.

For a file restore, preserve the failed database for investigation, remove stale
WAL/SHM siblings, place the backup at the configured `DB_FILE_NAME`, and only
then restart the application:

```sh
mv /data/jobs.db /data/jobs.failed.db
rm -f /data/jobs.db-wal /data/jobs.db-shm
cp /data/backups/jobs-YYYYMMDDTHHMMSSZ.db /data/jobs.db
```

After restart, pending migrations run again. Then re-verify the post-migration
checklist. Do not declare the restore complete merely because the process starts.
A restored database already contains the imported career data; do not re-import
unless the backup predates the import. Never overwrite production with a local
`jobs.db`.

## What not to do

- Do not commit `jobs.db`, its WAL/SHM files, database backups, or private career
  data.
- Do not copy only a live `.db`/WAL file as a backup; use the consistent
  snapshot command above.
- Do not replace a live SQLite file while the application is running, and never
  overwrite a production `jobs.db` with local data.
- Do not assume a schema migration also imports or synchronizes career data.
- Do not run `setup`/`start` expecting career-data synchronization; they migrate
  the schema only.
- Do not delete production data to make a failed migration pass.
- Do not edit an already-applied migration; add a new corrective migration.
- Do not deploy a destructive migration without testing it against a recent
  production snapshot, and keep deployment manual.
- Do not roll back the image without restoring the matching database snapshot:
  from `0027` onward the two are inseparable.
