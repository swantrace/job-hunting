# Skill intelligence test strategy

These tests are the executable companion to `.dsh/plan.md`.

## Test states

- `current-storage.test.ts` runs immediately. It builds an isolated SQLite database, seeds data at the migration `0010` boundary, then applies the complete migration directory. Future schema migrations must preserve the seeded application/skill relationship.
- Conditional contract tests use `test.todo` while their planned module or export does not exist. They automatically become active when the implementation boundary appears. Do not delete or rename these contracts to make a phase pass; implement the documented export or update the test and plan together when an API decision deliberately changes.
- Lifecycle todos in the existing generation, evidence-selection, and import suites are phase gates. Convert them to executable tests in the same commit that introduces the corresponding production behavior.

## Contract activation

| Test | Activates when |
| --- | --- |
| `taxonomy.contract.test.ts` | `src/lib/skills/constants.ts` and `normalize.ts` exist |
| `career-data-taxonomy.contract.test.ts` | the shared skill constants module exists |
| `future-schema.contract.test.ts` | Drizzle `skills` exposes `key` and `reviewStatus` |
| `career-sync.contract.test.ts` | `src/cli/sync-career-skills.ts` exists |
| `job-analysis.contract.test.ts` | the parser JSON schema changes skill items to objects |
| `gap-decisions.contract.test.ts` | `skillDecisionSchema` and/or `src/lib/skills/score.ts` exist |
| `tests/ui/resource-pages.contract.test.tsx` | all three resource index routes exist |

## Commands

```bash
bun run test:skills
bun run test:unit
bun test
```

Fixtures use only temporary databases and checked-in example career data. Tests must never read, write, copy, or print the user's production database, private career-data, generated artifacts, or secrets.
