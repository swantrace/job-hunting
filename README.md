# Job Application Tracker

A local-first, server-rendered job pipeline built with Bun, HonoX, htmx, Drizzle ORM, SQLite, Tailwind CSS, and daisyUI.

## Run locally

```sh
bun install
bun run db:migrate
bun run dev
```

The SQLite database is created as `jobs.db`. Set `DB_FILE_NAME` to use a different file.

## Career data and document generation

`career-data/` is the canonical, factual source used to generate documents. Keep stable IDs in those files: profiles refer to the IDs rather than copying experience or skill details.

- `candidate.json`, `experiences.json`, `achievements.json`, `projects.json`, `skills.json`, and `stories.json` hold the reusable facts.
- `preferences.json` and `portfolio-content.json` remain canonical planning data.
- `profiles/<direction>.profile.json` contains only direction-specific selection and ordering rules. Its `id` must match its filename.

Every generation run records an immutable evidence-selection snapshot in the database and writes a matching JSON file beneath `ARTIFACTS_DIR/run-<id>/`. The workspace’s **Evidence selection & generation record** section shows the exact selected IDs and schema/prompt versions, and lets you download that snapshot. This makes a generated resume or letter reviewable even after career data changes.

Do not use the old `profiles/candidate.profile.json`, `CANDIDATE_PROFILE_FILE`, or `CANDIDATE_PROFILE_JSON` configuration: candidate facts now come only from `career-data/candidate.json`.

For Fly.io deployment, `fly.toml` mounts a persistent volume at `/data` and sets `DB_FILE_NAME=/data/jobs.db`. The machine is configured to stop when idle and start automatically on the next HTTP request. Create the volume once before deploying:

```sh
fly volumes create data --region yyz --size 1
fly deploy
```

Set `ARTIFACTS_DIR=/data/artifacts` and `QUEUE_FILE_NAME=/data/bunqueue.db` in Fly as well, so snapshots, generated documents, and queued work survive machine restarts.

The production start command runs Drizzle migrations before starting the server. Keep one Fly machine for this SQLite deployment because Fly volumes are attached to a single machine.

### GitHub Actions deployment

The workflow in `.github/workflows/ci-cd.yml` runs formatting, typechecking, tests, and a production build for pull requests. A push to `main` deploys to Fly.io only after those checks pass. Add a repository secret named `FLY_API_TOKEN` before merging the first deployable change.

### VS Code Remote / WSL

The dev server listens on all interfaces at port `5173`. If `http://localhost:5173` is not reachable from your browser, open the VS Code **Ports** panel and forward port `5173`; VS Code will provide the correct localhost URL. You can also use the Network URL printed by Vite (for example, `http://172.17.x.x:5173/`).

## Useful commands

```sh
bun run typecheck
bun test
bun run build
bun run db:generate
bun run db:studio
```

All UI components are rendered on the server with `hono/jsx`. htmx performs fragment swaps; no React or Preact hydration runtime is used.
