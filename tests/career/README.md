# Database-owned career and skill mapping contracts

Step 1 fixtures and contracts for plan `career-database-v1`. They define the
synthetic inputs every later step consumes and freeze the rules that already hold
in the current schema.

## Fixtures

`fixtures.ts` is the single source of truth. Everything is invented
("Jordan Rivera", "Northwind Analytics") and never derived from the owner's
private career-data. The documents are written as the JSON files the production
loader already understands, so `loadCareerData`/`validateCareerData` stay the
authority for their shape.

| Fixture | Purpose |
| --- | --- |
| `syntheticCareerDocuments` | Full canonical dataset: candidate/authorization/career break/truth rules, education with date precision, experiences, achievements, projects, personal skills, stories, publications, directions, career preferences, portfolio topics, all with authored extension fields. |
| `catalogOnlySkills` | Approved catalog entries the candidate does not possess, used to prove mapping never implies possession. |
| `documentsWithAmbiguousAlias` | An alias that collides with another catalog entry's display name. |
| `syntheticRequirementTerms` | Composite, ambiguous, unknown, repeated, broad and curated-alias JD terms plus both composite orderings. |
| `seedPopulatedLegacyCatalog` | Populated catalog and analysis history: approved/pending/merged skills, alias, requirement mapping, candidate run. |
| `approvedBaseResumeManifest` / `approvedBaseResumeMarkdown` / `draftBaseResumeMarkdown` | Approved version plus an unapproved draft that must not replace it. |
| `sameDayRevisions` | Same date, different content, different hash. |

Helpers: `writeSyntheticCareerData` / `writeCareerDocuments` stamp cache-safe
mtimes (the loader caches by mtime only), and
`tests/support/career-data.ts:loadCareerDataFrom` owns the temporary directory
lifecycle. Databases are always temporary SQLite files outside the repository.

## Contract activation

Contracts become executable in the step that implements the behavior. Nothing
here is a placeholder: every test in this directory passes on the committed code,
and no deferred `test` dot `todo` declaration is introduced (the Harness hook
rejects an increased todo count).

| Contract | Activates in | File |
| --- | --- | --- |
| Fixture realism, editable field coverage, catalog versus personal facts, ambiguous alias conflict, same-day hashes, draft/approved separation | Step 1 (now) | `fixtures.test.ts` |
| Requirement mapping cannot express possession, catalog provenance preserved, Include requires a reason, one decision per skill per run | Step 1 (now) | `skill-catalog.contract.test.ts` |
| Approved Base Resume frozen by value, stale digest detection, enqueue snapshot columns | Step 1 (now) | `career-documents.contract.test.ts` |
| Relational career tables, junctions, stable-key uniqueness, merge redirects, mention storage, revision counters, duplicate rejection, fresh/populated migration, lossless analyses/artifacts/OAuth metadata | Step 2 (now) | `career-schema.migration.test.ts`, `repositories.test.ts` |
| Import idempotence/no-op, conflict rollback, stable ID remapping, full fact and extension roundtrip, dataset export scope and roundtrip | Step 3 | import/export suites to add here; singleton fact/extension roundtrip is already exercised by `repositories.test.ts` |
| Database runtime reads, snapshots/content identities, no filesystem fallback, frozen queued inputs, legacy snapshot readability | Step 4 | extend this directory |
| Catalog-bounded resolution: alias first, unknown/ambiguous stay pending, composite split, deduped occurrences, per-canonical-skill grouping, empty catalog safe | Step 5 | extend this directory |
| Mapping UI: Create new, explicit Skip, Remember alias, forged IDs, remap/unskip, readiness chaining | Step 6 | `tests/ui/*` mapping boundaries |
| Identity/experience/education persistence, key survival across rename, stale-form conflict, retirement | Step 7 | extend this directory |
| Achievements/projects/personal skills eligibility, unsafe sources never prove a match | Step 8 | extend this directory |
| Stories/publications/portfolio/preferences roundtrip, private URL defaults, portfolio-only edits not staling documents | Step 9 | extend this directory |
| Directions, bounded generation rules reaching drafting and validation, Base Resume draft/approval lifecycle | Step 10 | extend this directory |
| Import/export UI revalidation, ChatGPT context privacy defaults, legacy v4 compatibility | Step 11 | extend this directory |
| File-free restart, empty onboarding, Drive validation and confirmed pending uploads intact | Step 12 | extend this directory |

Existing suites that already carry part of this contract and must keep passing:

- `tests/skills/current-storage.test.ts` — seeds the migration 0010 boundary and
  proves the full migration directory preserves the seeded relationship.
- `tests/skills/future-schema.contract.test.ts` — canonical skill/alias columns.
- `tests/db/contract-migration.test.ts` — populated-fixture migration.
- `tests/base-resumes.test.ts` — manifest validation, loading and stale detection.
