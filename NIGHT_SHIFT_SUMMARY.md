# 🌙 Night-Shift Refactor Summary

Automated overnight execution of `.dsh/refactor_roadmap.md` against the
Job Application Tracker (HonoX + HTMX 2 + daisyUI 5 + SQLite).

**Final state:** `bun run typecheck` ✅ · `bun test` **39 pass / 0 fail** ✅ ·
`bun run build` ✅ · zero legacy daisyUI form classes · zero emoji/Unicode icons ·
working tree clean. Branch `deepseek-ui-refactor` advanced by **15 commits**.

---

## ✅ What was completed (all committed)

### Phase 1 — Infrastructure & contract repair (P0 core) — COMPLETE

| Step | Commit | Notes |
| --- | --- | --- |
| 1.1 test scaffolding | `854c0b9` | Pre-existing baseline (TDD contract suite). |
| 1.2 form primitives | `d23d25e` | `ui/FormField.tsx` (`InputField`/`SelectField`/`TextareaField`/`FileField`/`FieldHelp`/`FieldError`/`Fieldset`) + `FormErrorSummary.tsx`. |
| 1.3 isolated forms | `68ddc75` | AiParser, CareerDocuments, Import, Management migrated. |
| 1.4 dashboard/workspace forms | `347664c` | Dashboard + Workspace forms migrated; `Field`/`AnalysisField` removed. |
| 1.5 422 target alignment | `2535cdb` | Status 422 → board + OOB flash; career-documents/management 422 → full panel/content; contact/follow-up/interview 422 → full workspace with active tab + errors. |
| 1.6 422 swapping | `6f667c5` | Explicit `htmx.config.responseHandling` policy in `_renderer.tsx`. |

### Phase 2 — OOB fragment boundary cleanup — COMPLETE

| Step | Commit | Notes |
| --- | --- | --- |
| 2.1 workspace fragments | `079d3e3` | Split into `workspace/{WorkspaceShell,WorkspaceHeader,WorkspaceTabs,ApplicationPanel,ContactsPanel,ActivityPanel,DocumentsPanel}.tsx`; typed `WorkspaceTab` in `src/lib/validation.ts`; Documents panel; server-rendered active tab. |
| 2.2 response envelopes | `2f92269` | `responses/{MutationEnvelope,FlashMessage}.tsx`; `allowNestedOobSwaps = false`. |
| 2.4 app/status sync | `f35691b` | Status & application saves emit OOB `board`/`metrics`/`workspace-header`/`flash`. |
| 2.3 panel-local mutations | `5d86de9` | Contacts/Follow-up/Interview target their own panel with `outerHTML`. |
| 2.5 apply vs edit split | `e75495a` | `updateApplication` no longer forces `Applied`; distinct **Mark as applied** action (new `applied` status transition); "Save changes" label. |
| 2.6 error/OOB contracts | `19105a7` | Application-save envelope test (one instance per stable ID, OOB siblings top-level). |

### Phase 3 — Layout & visual system — mostly COMPLETE

| Step | Commit | Notes |
| --- | --- | --- |
| 3.1 shared AppShell | `506c967` | `layout/{AppShell,AppNavigation,PageHeader,Breadcrumbs}.tsx`; drawer renamed to `WorkspaceDrawer`; Dashboard/Manage/Import/Career Documents share the shell. |
| 3.4 icons/badges/empty/theme | `788dc36` | `ui/{Icon,StatusBadge,EmptyState}.tsx`; removed `📍 ↗ ✕ 🚀`; priority badges neutral; removed fixed `data-theme="corporate"` (dark `business` theme can now activate). |
| 3.5 local display dates | `788dc36` | `formatDisplayDate` (no UTC midnight shift) + `tests/date.test.ts`. |
| 3.3 responsive board | `a7ec8c2` | Kanban is horizontally scrollable (20rem min columns) instead of five squeezed columns; no page overflow. |
| 3.6 durable filters | `bdd5f7b` | `hx-push-url` + `hx-sync="this:replace"` + **Clear filters**; `/applications` renders the full page on reload. |

---

## ⛔ Deferred / skipped (with recommendations)

### 1. Step 3.2 — "New Opportunity" unified capture workflow (DEFERRED)
Manual Entry and AI Parse are still two separate cards in the 24rem capture rail.
This is the largest remaining UX refactor (one surface, two modes, one save) and
carries the highest regression risk without a browser harness to verify it.

**Recommendation:** introduce `app/components/opportunities/NewOpportunity.tsx`
as a modal/drawer with a Manual/AI mode toggle that both feed the existing
`QuickCollect` draft (the AI → draft population already works via
`ParsedJobDraft`). Then move it out of the `xl:grid-cols-[24rem_1fr]` rail so the
board takes full width.

### 2. Full Step 2.4 "form targets the panel" (PARTIAL)
The application form still targets `#application-form` (Phase 1.5 interim
contract) rather than `#workspace-application-panel`. The OOB
header/board/metrics sync and status synchronization are done; the form → panel
target narrowing + "422 returns only the invalid panel" remains. The existing
contract test (`422 form fragment boundaries`) asserts the form-level contract
and would need updating alongside this change.

### 3. Browser / visual / accessibility / keyboard tests (DEFERRED)
No browser harness exists in this checkout, so the following roadmap gates could
not be executed: responsive snapshots at 360/768/1024/1280/1440/1920px, keyboard
roving-tabindex assertions, focus management, accessibility scan, and
visual-regression snapshots. The server-rendered contracts are covered by
`tests/ui/*`; the interactive browser layer is not.

### 4. Minor known limitations
- `app/routes/applications/[id]/application-form.tsx` is now unreferenced (the
  destructive Application-tab `hx-get` was removed in 2.1) but was left in place.
- `MutationEnvelope` was created but `Responses.tsx` (`MutationResponse`) was not
  rewired to use it yet — it remains the older hand-assembled fragment.
- After **Mark as applied** from the open drawer, the drawer header updates via
  OOB, but the Application form itself re-renders only on the next panel swap, so
  the "Mark as applied" button can briefly persist. A `responseContext` value or
  an application-panel OOB update would close this.

---

## 🔒 Infrastructure honesty notes (important)

1. **`.dsh/hooks.sh` did not visibly fire in this session.** No `[GIT SAVED]` or
   hook output appeared in any tool result. I therefore ran
   `bun run typecheck`, `bun test`, `bun run build`, `npx biome check --write app src tests`,
   and `git diff --check` explicitly, and committed each step manually with
   `git add`/`git commit`. No `git reset --hard` / `git clean -fd` rollbacks were
   triggered or needed (the suite stayed green).
2. **MCP `memory-server` and `tech-docs-fetcher` are configured in
   `.dsh/config.json` but were not exposed as tools in this session.** I used the
   `daisyui` skill and `web_search` instead. Architecture lessons are captured
   here rather than in a memory store.
3. **`bun run format` fails repo-wide with pre-existing parse errors in
   `ui-template/*.html`** (the benchmark template, out of scope). I scoped Biome
   to `app src tests`, which is clean. This is pre-existing and unrelated to the
   refactor.
4. The suite was intentionally RED at baseline (the contract tests describe
   not-yet-landed roadmap features); it is now fully green.

---

## Stable fragment vocabulary (final contract)

| Fragment | ID |
| --- | --- |
| Application shell | `app-shell` (never an HTMX target) |
| Global nav drawer | `app-nav-toggle` |
| Pipeline board | `board` |
| Pipeline metrics | `metrics` |
| Workspace root | `workspace-shell` |
| Workspace header | `workspace-header` |
| Workspace tab list | `workspace-tabs` |
| Application panel | `workspace-application-panel` |
| Contacts panel | `workspace-contacts-panel` |
| Activity panel | `workspace-activity-panel` |
| Documents panel | `workspace-documents-panel` |
| Application form | `application-form` |
| Quick collect form | `quick-form` |
| AI parser result | `ai-parser-result` |
| Baseline generation | `baseline-generation-panel` |
| Import result | `import-result` |
| Management content | `management-content` |
| Flash/status | `flash` |

## Key mutation route matrix

| Route | Main target / swap | Success OOB | Error (422) |
| --- | --- | --- | --- |
| `PUT /applications/:id` | `#application-form` outerHTML | board, metrics, header, flash | form only |
| `PATCH /applications/:id/status` | `#board` outerHTML | metrics, header, flash | board + flash OOB |
| `POST /applications/:id/contacts` | `#workspace-contacts-panel` outerHTML | — (no status change) | contacts panel |
| `POST /applications/:id/follow-ups` | `#workspace-activity-panel` outerHTML | board, metrics, header | activity panel |
| `POST /applications/:id/interviews` | `#workspace-activity-panel` outerHTML | board, metrics, header | activity panel |
| `POST /career-documents/generation-runs` | `#baseline-generation-panel` outerHTML | — | full panel + error |
| `POST /manage/:kind`, `PUT/DELETE /manage/:kind/:id` | `#management-content` outerHTML | — | full content + error / flash |
| `POST /import`, `POST /import/confirm` | `#import-result` innerHTML | — | alert child |

Nested OOB processing is disabled; all OOB fragments are top-level siblings.
