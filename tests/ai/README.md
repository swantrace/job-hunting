# LLM workflow contract tests

These tests are the executable companion to the current `.dsh/plan.md`.

The planned production modules do not all exist yet. Each contract therefore selects `test.todo` until its complete activation boundary exists; once the relevant module or component is added, every test in that contract becomes executable automatically.

Activation boundaries:

| Contract | Activates when |
| --- | --- |
| `job-analysis-v3.contract.test.ts` | job-analysis schema and prompt modules exist |
| `candidate-fit.contract.test.ts` | candidate-fit schema, prompt, and service validator exist |
| `analysis-persistence.contract.test.ts` | Drizzle exports both normalized requirements and application analysis runs |
| `generation-provenance-v2.contract.test.ts` | generation schemas contain claim evidence references and the provenance validator exists |
| `ats-audit.contract.test.ts` | the deterministic ATS audit module exists |
| `../requirements/scoring.contract.test.ts` | the requirement coverage module exists |
| `../ui/llm-review-workflow.contract.test.tsx` | the planned review components and analysis-run route exist |

Do not delete, skip, weaken, or rename a contract to avoid activation. Implement the planned boundary and make the activated tests pass in the same step.

All fixtures must use checked-in example data, in-memory SQLite, and mocked provider responses. Tests must never read private career-data/profiles, the production database, generated artifacts, OAuth tokens, secrets, or the network.
