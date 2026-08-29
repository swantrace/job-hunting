# UI refactor contract tests

`bun test` runs the complete test suite. Planned modules use conditional todo contracts so the
suite remains executable before their implementation files exist.

Established contracts cover:

- the shared daisyUI 5 `FormField` module and accessible field markup;
- stable workspace shell, tab, panel, board, metrics, and OOB response boundaries;
- preservation of the server-rendered active workspace tab;
- target-compatible 422 responses and the global HTMX 422 swap policy.

Failures such as `Cannot find module`, `SyntaxError`, `ReferenceError`, or a TypeScript compilation
error are not valid TDD failures and must be fixed before continuing the refactor.

The LLM review workflow contract activates when its planned components and route exist. Once
active, it protects the nested Review-tab fragments, queued-state accessibility, daisyUI 5 table
markup, and OOB response boundaries.
