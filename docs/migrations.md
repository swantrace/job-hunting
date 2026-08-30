# Database migration, backup, and recovery runbook

This document is the operational checklist for changing the SQLite schema used
by Job Tracker. It intentionally describes the current migration process rather
than individual historical tables. The migration files themselves are the
record of schema history.

## Sources of truth

- `src/db/schema.ts` defines the current Drizzle schema.
- `drizzle/*.sql` contains ordered, immutable database migrations.
- `drizzle/meta/_journal.json` records their execution order.
- `src/db/migrate.ts` applies pending migrations with Drizzle.
- `career-data/skill-taxonomy.json` owns skill category keys, labels, and order.
- `career-data/skills.json` owns the candidate's evidenced career skills.

The taxonomy and career-data synchronization commands update application data;
they are not schema migrations. Run them only after the schema is current.

## Runtime behavior

The production start command performs these operations in order:

```text
db:migrate -> taxonomy:sync --apply -> skills:sync --if-present --apply -> start server
```

This makes normal restarts idempotent, but it does not replace backups or
pre-deployment validation. A migration failure prevents the server from
starting and must never be handled by deleting the production database.

The Fly deployment uses these persistent paths:

```text
/data/jobs.db
/data/bunqueue.db
/data/artifacts/
/data/career-data/
/data/profiles/
```

A database backup covers only `jobs.db`. Back up generated artifacts, queued
work, career data, and profiles separately when a complete environment snapshot
is required.

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

Do this before deploying an image that contains new migrations. Avoid editing
applications while the snapshot is being created.

Open a console on the currently running Fly machine:

```sh
fly ssh console -a job-hunting
```

Inside the machine, create a consistent standalone SQLite snapshot. Bun's
`Database.serialize()` includes the committed database state even though the
live application uses WAL mode:

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

The local `backups/` directory and SQLite files must remain ignored by Git.

## Production deployment checklist

1. Confirm CI passes on the exact commit being deployed.
2. Confirm `/data/career-data/skill-taxonomy.json` exists when
   `CAREER_DATA_DIR=/data/career-data` is configured.
3. Create and download the production backup described above.
4. Test pending migrations against a disposable copy of that backup.
5. Trigger the GitHub Actions `workflow_dispatch` deployment from `main`, or run
   the approved manual Fly deployment command.
6. Watch startup logs. `Database migrations applied.` must appear before the
   taxonomy and career-skill synchronization messages.
7. Open the application and verify the critical workflow before allowing new
   writes.

Pushing or merging to `main` runs CI but does not deploy automatically. The
current workflow deploys only when manually triggered with `workflow_dispatch`.

## Post-migration verification

Verify more than whether the home page loads:

1. Check Fly logs for migration, constraint, or missing-table errors.
2. Open Applications, Skills, Companies, Contacts, and Career Documents.
3. Open an existing application and confirm its Job Post, Review, Documents,
   Contacts, and Activities data still resolve.
4. Confirm expected counts for applications, companies, contacts, postings,
   analysis runs, generation runs, and artifacts.
5. Run `PRAGMA foreign_key_check` against the production database or a new
   post-deployment snapshot.
6. Run the idempotent synchronization checks when career data is mounted:

   ```sh
   bun run taxonomy:sync --apply
   bun run skills:sync --apply
   bun run skills:audit
   ```

7. Restart once and confirm the migration and synchronization sequence remains
   idempotent.

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

After restart, pending migrations will run again. Then synchronize the mounted
taxonomy and career skills:

```sh
bun run taxonomy:sync --apply
bun run skills:sync --apply
bun run skills:audit
```

Finally, repeat the post-migration verification checklist. Do not declare the
restore complete merely because the process starts.

## What not to do

- Do not commit `jobs.db`, its WAL/SHM files, database backups, or private career
  data.
- Do not replace a live SQLite file while the application is running.
- Do not assume a schema migration also synchronizes taxonomy or career data.
- Do not delete production data to make a failed migration pass.
- Do not edit an already-applied migration; add a new corrective migration.
- Do not deploy a destructive migration without testing it against a recent
  production snapshot.
