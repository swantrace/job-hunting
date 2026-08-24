# UI refactor contract tests

`npm test` runs the complete `bun:test` suite. During the refactor, failed expectations are
intentional when they describe a roadmap feature that has not landed yet.

Expected red tests currently cover:

- the shared daisyUI 5 `FormField` module and accessible field markup;
- stable workspace shell, tab, panel, board, metrics, and OOB response boundaries;
- preservation of the server-rendered active workspace tab;
- target-compatible 422 responses and the global HTMX 422 swap policy.

Failures such as `Cannot find module`, `SyntaxError`, `ReferenceError`, or a TypeScript compilation
error are not valid TDD failures and must be fixed before continuing the refactor.

The Documents panel and Network page use `mock.module()` virtual implementations because those
modules do not exist yet. When their real modules are added, replace the virtual contracts with
imports of the production components/routes while keeping the same stable DOM boundary assertions.
