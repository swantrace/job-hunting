# Job Application Tracker

Chrome extension integration: [authenticated batch intake API](docs/job-intake-api.md)
automatically runs job and candidate analysis, then leaves Include/Skip review
and document generation under your control.

A single-user, local-first job pipeline. Bun serves a HonoX application that
renders HTML with `hono/jsx`; htmx performs fragment swaps. There is no SPA, no
client hydration framework, and no ORM other than Drizzle.

## What it does

- **Applications** — track each role through `Saved`, `Apply Today`, `Applied`,
  `Follow Up`, `Interviewing`, `Rejected`, and `Archived`, with `A`/`B`/`C`
  priority, list and board views, activities (follow-ups and interviews), and
  versioned Job Post raw text.
- **Job post intake** — import one `https` URL or one pasted job description per
  box at `/applications/import`, preserving input order. URLs are validated
  before any fetch (`https` only, no credentials, no localhost/private/reserved
  addresses, bounded redirects/bytes/time, scripts and styles stripped). A
  blocked or failed link becomes **Needs pasted text**; blank or error HTML is
  never sent to the model.
- **Review and decisions** — parse a posting into structured requirements, see
  each requirement's importance, source excerpt, evidence status, and
  Include/Skip controls, and read dual coverage scores.
- **Documents** — generate a targeted resume and cover letter from an approved
  Base Resume plus canonical Career Data (and the reviewed JD), or a
  direction-only baseline with no JD. Warnings, an optional semantic review,
  DOCX artifacts, and optional Google Drive upload.
- **Career Data** — author identity, experience, education, achievements,
  projects, skills, stories, publications, preferences, directions, and Base
  Resume versions, then import/export them.
- **Career growth** — a derived read model over active applications, grouped by
  canonical skill.
- **Backup and restore** — a portable JSON export/import of core operational
  data, separate from a full SQLite backup.

## Architecture

### SQLite owns all runtime data

`jobs.db` (or `DB_FILE_NAME`) is the runtime authority for applications, job
postings, analyses, requirements and skill mentions, career facts, directions,
the skill catalog, personal skills, and Base Resume versions. JSON is
**import/export interchange only**; it is never read as live state.

The schema is defined in `src/db/schema.ts`: **36 application tables plus one
view**. `job_requirements_to_skills` is a read-only view derived from
`job_requirement_skill_mentions`, so mapping writes only ever touch the mention
that owns them. There is no `career_state` table: each career table carries its
own `extension_json` for authored fields the schema does not model,
`career_profile.documents_json` carries unmodelled per-source-document values,
and career change detection is a value computed from the data rather than a
stored revision counter.

### Legacy career files are import-only

A legacy `career-data/` directory (`*.json`, `skill-taxonomy.json`,
`base-resumes/`) and the `CAREER_DATA_DIR` / `CAREER_BASE_RESUMES_DIR`
environment variables are **import-only** inputs. The running application never
reads them: it reads career facts, directions, categories, personal skills, and
Base Resume versions from SQLite and needs neither variable to boot. There are
no import, export, or sync command-line tools; every import/export is a browser
flow.

### Requests and async work

The application persists each requested operation as an append-only run in
SQLite before queueing it. In production the named queues use embedded Bunqueue
with durable state in `QUEUE_FILE_NAME` (normally `/data/bunqueue.db`); at
startup the application recovers queued runs. Development runs the same jobs
in-process without Bunqueue persistence. The browser never waits for a model
response: it polls the persisted run state through htmx.

At boot, before the server accepts requests, the health check verifies that the
canonical tables and migration-added columns exist and fails fast with a readable
message naming the missing object. An empty but fully migrated database is
healthy and renders the Career Data onboarding state.

## Feature map

### Applications pipeline

Applications are edited through the workspace and its tabs (Job Post, Review,
Documents, Contacts, Activities). Workspace tabs are gated: Review opens once a
current structured Job Analysis exists, and Documents opens once the current
Review is ready.

### Job analysis and candidate analysis

- **Job Analysis** extracts structured requirements (type, importance, source
  excerpt) and a direction proposal from the raw posting plus a bounded snapshot
  of the approved catalog. Exact catalog keys and curated aliases resolve
  deterministically; unknown or ambiguous terms stay pending as
  requirement-owned mentions and never auto-create catalog records.
- **Candidate Analysis** compares the reviewed requirements against frozen
  canonical Career Data and returns a labelled
  `apply`/`apply-selectively`/`skip` recommendation plus a requirement-to-evidence
  matrix. After a completed Job Analysis with no unresolved terms it is queued
  automatically; it can also be re-run explicitly.
- **Review** shows each requirement's importance, source excerpt, evidence
  status (`direct`, `transferable`, or `unknown-evidence`), and Include/Skip
  controls. Decisions are scoped to a Candidate Analysis run: a new run starts
  every missing skill as `pending`, and an Include requires a truthful
  reason. A blank or whitespace input is never treated as a Skip; Skip is an
  explicit decision.
- Dual scores are shown for coverage: **canonical match** (proven matches only)
  and **application coverage** (proven matches plus user-confirmed Includes).
  Skipped and pending requirements count as uncovered. Weights are `required` =
  3, `preferred` = 1, `mentioned` = 0. These are transparent heuristics, not
  vendor ATS scores, and there is no universal numeric fit score.

Reruns never overwrite history. Each run stores its frozen input hash and is
labelled `Outdated` when the current inputs differ; staleness is always derived,
never persisted. Job Analysis staleness is driven by the posting content hash and
the parser/job-analysis prompt and schema versions — model-only changes never
make a completed analysis stale, and the catalog is resolved separately so a
catalog edit enables remapping without another paid extraction. Candidate
Analysis staleness is driven by the completed Job Analysis and canonical career
data; changing a Skip/Include decision does not invalidate it. Documents
additionally depend on the direction, run-scoped decisions, canonical evidence,
generation contract versions, and the configured models.

### Documents and generated artifacts

Documents are drafted from an **approved Base Resume** (editorial prior) plus
**complete canonical Career Data** (factual authority), with the reviewed JD when
generating for a specific application. The model writes Markdown against a
controlled section vocabulary; a safe parser produces a typed document model,
deterministic checks report omissions, dates, and unsupported claims, and code
renders the DOCX. The renderer owns the title, contact line, and layout.

- With a JD: a targeted resume and cover letter grounded in the reviewed JD and
  the resolved Include/Skip decisions. Direction selects the Base Resume and
  target titles only.
- Without a JD (baseline, under **Career documents**): a reusable direction
  baseline from the Base Resume and Career Data only. It never invents an
  employer or claims JD alignment.

Every generation run records an immutable evidence-selection snapshot in SQLite
and writes its files under `ARTIFACTS_DIR/run-<id>/` (baseline runs use
`baseline-run-<id>/`). The workspace's generation record exposes the selected
IDs, schema/prompt versions, and the snapshot download so a document stays
reviewable after career data changes. A
generated document is a draft, not an approved application artifact. A missing
approved Base Resume disables generation for that direction only; the app never
falls back to a blank resume.

Optional semantic document review observes and reports findings
(`blocking`/`important`/`optional`); it never rewrites documents and its findings
never become career facts. When Google Drive is connected, a generated artifact
can be uploaded; the OAuth refresh token is stored encrypted in SQLite with a key
derived from `GOOGLE_OAUTH_STATE_SECRET`.

### Career Data

Manage career data under **Career Data**, whose tabs are Identity, Experience,
Education, Achievements, Projects, Skills, Stories, Publications, Preferences,
Directions, Base resumes, and Import & export. A fresh database shows onboarding
guidance and asks for identity first.

- An **approved Base Resume** is private Markdown that seeds drafting while
  database career facts remain the factual authority. Versions live in
  `career_base_resumes` with their direction, version label, approval date, and
  normalized-text SHA-256 hash. Superseded and draft versions are kept so
  historical documents stay reproducible. A draft never replaces an approved
  version without an explicit approval action.
- **Directions** carry their label and target titles; bounded generation rules are
  edited per direction.
- Every original field from an imported source, including authored extension
  fields, is preserved in the database and remains editable in the UI. Imports
  merge by stable key, never delete records missing from the source, and report
  conflicts instead of guessing.

### Transfer (import and export)

All career import/export lives under `/career-data/transfer` and makes no network
call:

- **Import** accepts a `career-dataset` JSON export or a zip archive of a legacy
  `career-data/` directory. The archive is read in memory only (bounded size and
  entry count, unsafe paths rejected). Preview reports counts and conflicts and
  binds both a source fingerprint and the database fingerprint; confirming
  re-derives both and writes nothing when the source changed, the database
  changed, or a conflict remains. A conflict-free import is applied in one
  transaction. `career-data.example/` is a small valid legacy dataset you can
  zip and import to seed a fresh database.
- **Career dataset export** (`career-dataset-<scope>-<date>.json`) downloads the
  full dataset or one direction and the records linked to it, marked with its own
  `format` so it can never be confused with the application backup.
- **ChatGPT context export** produces one versioned JSON context per direction
  (or full scope) combining the approved Base Resume with safe career facts and
  an evidence index. Publication source URLs and contact details are excluded
  unless explicitly opted in. Regenerate it after changing career facts or
  approving a Base Resume.

### Career growth

`/career-growth` is a derived read model over active applications (Archived and
Rejected are excluded), grouped by canonical skill and ranked by application
frequency, requirement importance, direction relevance, and retention. It uses
neutral labels — *Verify existing evidence*, *Consider learning/project
evidence*, and *Low priority* — and never writes a mutable table or modifies
Career Data. Include reasons are context only, never proof.

### Skills, companies, and contacts

The catalog and reusable network records have their own bookmarkable pages:

- `/skills` — review, approve, reject, recategorize, alias, and merge canonical
  skills. The category vocabulary itself comes from the imported taxonomy and is
  stored in `skill_categories`.
- `/companies` — search companies, open websites, and merge duplicates.
- `/contacts` — manage contacts independently while they stay available in
  application workspaces.

Each page provides **Delete** beside **Edit**, with a confirmation before removal.
Deleting a contact also removes its application links, but keeps the applications.
Companies linked to applications or contacts cannot be deleted. A skill used only
in job analysis can be deleted: its original terms and sources remain as skipped
mentions, while related Include/Skip decisions and aliases are removed. Career
facts and incoming merge redirects still prevent deletion; merge duplicates or
remove personal references first. Cleanup is transactional, so a blocked deletion
does not change mappings or decisions. Historical AI snapshots and documents are
not rewritten; changed skill mappings make downstream analysis stale. Pure
punctuation terms are ignored during parsing and never become new catalog skills.
The current
search and filters are preserved after deletion, including blocked requests.

### Backup and restore

`/export` downloads a **portable core-data export** (schema version 5):
companies, contacts, applications, the reviewed skill catalog and aliases,
activities, application-contact links, and Job Post raw-text versions. It
deliberately omits derived AI history, generated artifacts, baseline history, and
OAuth connections. `/import` previews and merges that JSON. The career dataset
and ChatGPT context cover career facts, directions, catalogs, and approved Base
Resumes.

None of these is a full backup. **Full operational recovery requires a
consistent SQLite backup AND an artifact backup.**

## Data model and migrations

Migrations are handwritten, forward-only, immutable SQL files in `drizzle/` with
their execution order recorded in `drizzle/meta/_journal.json`. `bun run
db:migrate` (`src/db/migrate.ts`) applies pending migrations in order and sets
foreign keys and WAL mode. Never generate migrations and never edit or reorder an
applied one; add a new corrective migration instead. Schema and code ship
together, so a rollback means restoring the matching database snapshot *and*
redeploying the previous image together. See [`docs/migrations.md`](docs/migrations.md)
for the full migration, backup, restore, and production runbook.

## Environment variables

Copy `.env.example` to `.env` for local development. `.env` is ignored by Git.

| Variable | Purpose |
| --- | --- |
| `DB_FILE_NAME` | SQLite file for all runtime data. Defaults to `jobs.db` (Fly: `/data/jobs.db`). |
| `QUEUE_FILE_NAME` | Durable Bunqueue file. Defaults to `bunqueue.db` (Fly: `/data/bunqueue.db`). |
| `ARTIFACTS_DIR` | Generated artifacts root. Defaults to `artifacts` (Fly: `/data/artifacts`). |
| `OPENAI_API_KEY` | Needed only for AI parsing, analysis, generation, and semantic review. |
| `OPENAI_MODEL_DEFAULT` | Fallback for every specialized model below. |
| `OPENAI_MODEL_JOB_PARSER` | Job parsing and Job Analysis. |
| `OPENAI_MODEL_CANDIDATE_FIT` | Candidate Analysis. |
| `OPENAI_MODEL_RESUME` | Resume drafting. |
| `OPENAI_MODEL_COVER_LETTER` | Cover-letter drafting. |
| `OPENAI_MODEL_DOCUMENT_REVIEW` | Optional semantic document review. |
| `OPENAI_JOB_PARSER_TIMEOUT_MS` | Job-parser request timeout (bounded 10s–300s, default 90s). |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | Optional Google Drive upload. The state secret also derives the refresh-token encryption key. |
| `APP_AUTH_REQUIRED`, `APP_AUTH_USERNAME`, `APP_AUTH_PASSWORD` | Optional Basic Auth. On a deployment with `APP_AUTH_REQUIRED=true`, missing credentials fail closed with `503`. |
| `CAREER_DATA_DIR`, `CAREER_BASE_RESUMES_DIR` | **Optional import-only** inputs. `CAREER_DATA_DIR` points at a legacy `career-data/` directory; `CAREER_BASE_RESUMES_DIR` at staged Base Resume Markdown (default `<CAREER_DATA_DIR>/base-resumes`). The running app reads neither — all runtime career data comes from SQLite. |

Every application route also applies same-origin CSRF validation, security
headers, and `Cache-Control: no-store`.

### Model selection

Each AI stage reads its own variable and falls back to `OPENAI_MODEL_DEFAULT`; the
defaults live in `src/ai/models.ts` and nowhere else. This repository targets the
GPT-6 family: `gpt-6-astra` (highest intelligence), `gpt-6.1-sol` (balanced,
near-Astra performance at lower cost — the current default) and `gpt-6-luna`
(fastest and cheapest). No request sets `reasoning.effort`, so the `none` and
`minimal` efforts that Astra and 6.1 Sol reject are never asked for.

| Stage | Variable | What a weaker model costs you |
| --- | --- | --- |
| Job Description parsing and requirement extraction | `OPENAI_MODEL_JOB_PARSER` | Everything downstream is built on the extracted requirements. |
| Candidate-fit evidence status | `OPENAI_MODEL_CANDIDATE_FIT` | Evidence status decides what the drafts may claim; a wrong `direct` breaks the truthfulness rule. |
| Resume drafting | `OPENAI_MODEL_RESUME` | Quality of the document you send. |
| Cover letter drafting | `OPENAI_MODEL_COVER_LETTER` | Quality of the document you send. |
| Document review | `OPENAI_MODEL_DOCUMENT_REVIEW` | Advisory findings only; it never writes to the database. |

Reasoning effort is hardcoded per stage in `src/ai/models.ts`, not configurable:
`high` for Job Description parsing and job analysis (the heaviest single call, and
`xhigh`/`max` would risk the 90s parser timeout), `high` for candidate fit (the
evidence status every later claim rests on), `medium` for resume and cover-letter
drafting (writing, not puzzle-solving), and `low` for the advisory document review.
No stage uses the `none` or `minimal` efforts, which Astra and 6.1 Sol reject.

Switching `OPENAI_MODEL_RESUME` or `OPENAI_MODEL_COVER_LETTER` marks existing
generated documents stale (`generation-model-changed`). The analysis stages do
**not** track the model in their input hash: switching their model leaves earlier
analyses looking current. Bump the relevant prompt version constant in the same
change when you want dependent data re-run, and note that the keyword audit of
generated drafts is deterministic and costs no model call.

## Local development

```sh
bun install
bun run db:migrate   # apply pending migrations (safe to re-run)
bun run dev          # HonoX dev server on 0.0.0.0:5173
```

The Vite dev server uses polling file watching and a fixed HMR client port so it
stays reliable under WSL, Docker, or a mounted filesystem. If the port is not
reachable from your browser, forward `5173` (VS Code **Ports** panel) or use the
printed Network URL.

`package.json` defines exactly these scripts:

| Script | Command |
| --- | --- |
| `dev` | `bunx --bun vite` |
| `build` | `vite build --mode client && vite build` |
| `start` | `bun run db:migrate && cd dist && bun index.js` |
| `db:migrate` | `bun run src/db/migrate.ts` |
| `db:studio` | `drizzle-kit studio` |
| `format` | `biome check --write .` |
| `format:check` | `biome check .` |
| `typecheck` | `tsc --noEmit` |
| `test` | `bun test` |

## Tests and quality gates

```sh
bun run format:check
bun run typecheck
bun test
bun run build
```

`bun test` is a single suite. Tests run against temporary migrated databases and
must never read or write the owner's `jobs.db`, private `career-data/`,
`artifacts/`, or secrets. The Bun test preload points `DB_FILE_NAME` at a fresh
temporary database and refuses to migrate or seed a path inside the repository.
Migrations are exercised against both empty and populated temporary databases
and never call an LLM.

## Deployment

The app deploys to Fly.io as `job-hunting` (region `yyz`) with a persistent volume
mounted at `/data`:

```text
/data/jobs.db         # all runtime data
/data/bunqueue.db     # durable queue state
/data/artifacts/      # generated documents and snapshots
/data/career-data/    # import-only legacy files, when present
```

`bun run start` runs `bun run db:migrate` before booting the server, so a deploy
migrates the schema on startup. Keep a single Fly machine: the SQLite volume
attaches to one machine, and `fly.toml` keeps it running
(`auto_stop_machines = 'off'`, `min_machines_running = 1`).

```sh
fly volumes create data --region yyz --size 1
fly secrets set --app job-hunting \
  APP_AUTH_USERNAME='...' \
  APP_AUTH_PASSWORD='...'
fly deploy
```

GitHub Actions (`.github/workflows/ci-cd.yml`) runs formatting, typechecking,
tests, and a production build on push and pull request to `main`. Deployment is
manual and deliberate: the Fly deploy job runs only for a `workflow_dispatch` on
`main`, so add a `FLY_API_TOKEN` repository secret, then open **Actions → CI and
Fly Deploy → Run workflow** from `main` after CI passes. Pushing to `main` never
deploys.

Before any deploy that carries migrations, take a consistent SQLite snapshot (not
a bare copy of a live `.db`/WAL file) and back up `artifacts/`; the runbook in
[`docs/migrations.md`](docs/migrations.md) covers the commands and the recovery
procedure.

## Safety invariants

- **Catalog records are never created by model output.** LLM-returned strings
  cannot create a `skills` record; they resolve against the frozen approved
  catalog or stay pending as requirement-owned mentions for explicit mapping.
- **Catalog mapping never proves personal skill possession.** Matching a
  requirement to a catalog skill says nothing about whether the author has it;
  evidence status comes only from canonical Career Data.
- **A blank answer is not a Skip.** Skip is an explicit decision, and an Include
  requires a truthful, application-specific reason — the only claim an Include
  authorizes in generated documents.
- **Decisions are application-only.** They never write to career records, never
  change the canonical score, and never fabricate professional experience.
- **Drafts never replace an approved Base Resume** without an explicit approval
  action; drafts and superseded versions are retained.
- **Every authored fact and extension field is preserved.** Imported fields the
  schema does not model are kept in the owning row's `extension_json` (or
  `career_profile.documents_json`) and stay editable, so nothing is silently
  dropped.
- **Stale results are never deleted.** Outdated runs, artifacts, Drive links,
  snapshots, audits, and reviews stay accessible; nothing reruns automatically.
