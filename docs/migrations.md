# Database migration and restore checklist

The skill intelligence work replaced the two-column `skills` table with a
canonical taxonomy (`skills` + `skill_aliases`) and enriched the
application-to-skill relationship with analysis results and user decisions.
Existing numeric skill IDs and application relationships are preserved through
migration `0011_canonical_skills.sql`.

## Before migrating production

1. Stop the application or put the Fly machine into a quiet state.
2. Back up the SQLite database file, including any `-wal`/`-shm` siblings, so a
   rollback is complete:

   ```sh
   fly ssh console -a <app>
   cd /data
   sqlite3 jobs.db ".backup 'jobs-backup-$(date +%F).db'"
   ```

   Locally, copy `jobs.db`, `jobs.db-wal`, and `jobs.db-shm` together.

3. Record the career-data version being used (`career-data/skills.json`
   `lastUpdated` and each file's `schemaVersion`).

## Applying the migration

Drizzle migrations run automatically before the server starts. For a manual,
explicit application:

```sh
bun run db:migrate
```

Migration `0011` rebuilds `skills` and `job_applications_to_skills`, backfills
legacy names as `legacy-<id>` keys and first aliases, and leaves foreign keys
enabled. It performs no semantic merges.

## After migrating

1. Synchronize career data into the new taxonomy (idempotent):

   ```sh
   bun run skills:sync --apply
   ```

2. Review the taxonomy for duplicates and non-skills:

   ```sh
   bun run skills:audit
   ```

3. Verify counts: applications, companies, contacts, postings, and generation
   runs must match the pre-migration numbers. Open the Skills page and confirm
   career skills are `approved` with their aliases present.

## Restore verification

1. Stop the application.
2. Restore the backup files (database plus `-wal`/`-shm` if present).
3. Start the application; Drizzle re-applies any pending migrations.
4. Run `bun run skills:sync --apply` to re-link career mappings.
5. Re-run `bun run skills:audit` and spot-check a few applications to confirm
   their skill decisions and generation snapshots remain intact.
