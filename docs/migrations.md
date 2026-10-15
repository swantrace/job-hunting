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
- `jobs.db` (or `DB_FILE_NAME`) owns career facts, directions, categories,
  personal skills, Base Resume versions, and the operational skill catalog.
- A legacy `career-data/` directory (`*.json`, `skill-taxonomy.json`,
  `base-resumes/`) is an **import-only** source. It is never read at runtime and
  is never synchronized automatically.
  `bun run career:import --source <dir> --database <path>` loads it.

`bun run setup` and `bun run start` apply schema migrations only. They do not
run `taxonomy:sync`, `skills:sync`, or any other file synchronizer, even if a
career-data directory is mounted.

## Runtime behavior

The production start command performs these operations in order:

```text
db:migrate -> start server
```

The legacy per-file sync commands (`taxonomy:sync`, `skills:sync`) and the Fly
file upload (`fly:sync-career-data`) still exist as explicit, import-only tools,
but no boot path invokes them. A migration failure prevents the server from
starting and must never be handled by deleting the production database.

### CLI database selection (required)

Every CLI that opens or writes the database — `career:import`, `career:export`,
`career:export-chatgpt-context`, `resume:import`, `resume:experiment`,
`skills:audit`, `artifacts:audit`, `taxonomy:sync`, `skills:sync` and
`fly:sync-career-data` — resolves its target from `--database <path>` or
`DB_FILE_NAME` and fails loudly when neither is set:

```text
No database selected: pass --database <path> or set DB_FILE_NAME.
Refusing to fall back to ./jobs.db because a CLI could then read or write production data.
```

The app server is unchanged and still defaults to `DB_FILE_NAME ?? 'jobs.db'`.
The `db:migrate` script is part of that server path and keeps the same default.

`src/db/health.ts` runs at boot before the server accepts requests. If any
canonical table or migration-added column is missing it fails fast with a
readable message naming the missing object, for example:

```text
Database schema is missing required table(s): career_candidate, career_state, ...
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

## Creating a migration

1. Change `src/db/schema.ts`.
2. Add the next ordered SQL file under `drizzle/` and its journal entry. Use
   `bun run db:generate` when Drizzle can express the change safely; review all
   generated SQL before accepting it.
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
4. **Dry-run the import (default).** Point `--source` at the existing volume
   directory and `--database` at the production database. A dry run writes
   nothing and prints the source hash, database revision, per-kind counts and
   every conflict:

   ```sh
   cd /app
   bun run career:import --source /data/career-data --database /data/jobs.db
   ```

   Importing from a dataset JSON file works the same way:

   ```sh
   bun run career:import --source /data/career-data/career-dataset.json --database /data/jobs.db
   ```

5. **Review conflicts and counts.** Any reported conflict blocks the whole
   import. Resolve the source or the conflicting database record, then run a new
   dry run — a stale preview is rejected, so always re-run before applying.
   Verify the planned inserts/updates match the legacy files and that unrelated
   operational tables are untouched.
6. **Apply in one transaction.**

   ```sh
   cd /app
   bun run career:import --source /data/career-data --database /data/jobs.db --apply
   ```

   The apply is transactional; on any validation error nothing is written.
7. **Verify readiness and counts.** Re-run the count query from step 2 and
   confirm the career tables are populated; an empty `career_candidate` means
   onboarding still applies. Check foreign-key integrity:

   ```sh
   cd /app
   bun -e '
     import { Database } from "bun:sqlite";
     const db = new Database("/data/jobs.db", { readonly: true });
     console.log("fk violations", db.query("PRAGMA foreign_key_check").all());
     for (const t of ["career_candidate", "career_experiences", "career_skills", "career_base_resumes"])
       console.log(t, db.query(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
     db.close();
   '
   ```

   Then open the app and confirm: Career Data loads, an approved Base Resume is
   selected per direction, Review resolves requirements, and an existing
   application still shows its Job Post, Documents, Contacts and Activities.
   Drive connection status and confirmed pending uploads must still work.
8. **Retire the file-based environment variables.** Once the database is
   authoritative and verified, remove `CAREER_DATA_DIR` (and
   `CAREER_BASE_RESUMES_DIR` if set) from the Fly app configuration and from any
   local `.env`, so nothing suggests runtime file reads:

   ```sh
   fly secrets unset CAREER_DATA_DIR --app job-hunting   # only if set as a secret
   ```

   If the variable is set in `fly.toml` `[env]` instead, remove it there and
   deploy the change through the normal manual flow. Keep the legacy
   `/data/career-data/` files in place until you have confirmed the import and
   kept the backup; they are harmless once unused.
9. **Keep the manual deploy policy.** Do not enable automatic deployment, and do
   not deploy again until the checks above pass. If something is wrong, fix
   forward with a new migration or restore the snapshot during a maintenance
   window (see Recovery).

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
3. Open an existing application and confirm its Job Post, Review, Documents,
   Contacts, and Activities data still resolve.
4. Confirm expected counts for applications, companies, contacts, postings,
   analysis runs, generation runs, artifacts, and the career tables.
5. Run `PRAGMA foreign_key_check` against the production database or a new
   post-deployment snapshot.
6. Confirm Google Drive connection verification and user-confirmed pending
   uploads still behave correctly.
7. Restart once and confirm the migration step is idempotent and the boot health
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
