# superpowers-panel

Function-hooks mod for Claude Code. See the README for usage.

## Code conventions

- Identifiers, comments and test descriptions are written in **English**. User-facing text
  (pane, `/sp` replies) goes through the i18n catalog in `hooks/i18n/`, in **PT-BR** and **English**;
  PT-BR keeps correct accents.
- Use descriptive names. No 1–3 letter abbreviations, except `$`, `e` and `next` (the engine's
  hook API convention) and loop indexes. `raw` is fine for a not-yet-validated object.
- A comment explains _why_ (an engine constraint, a non-obvious decision), never _what_ the line does.
- No dead code and no commented-out code.
- Cognitive complexity ≤ 10 per function; a function with more than 4 parameters takes an object.
- Never raise the limits or add `biome-ignore` to get past a check: refactor instead.
- Engine constraints to preserve: atoms are declared in the file that calls `read`/`update` on them;
  `$` is only passed to top-level functions; `update` has the atom written at the call site.
- Mod tests use `claude-code/testing` and are named `*.test.ts(x)`; tooling tests under `scripts/`
  use `bun:test` and must be named `*.spec.ts` (`claude plugin test` collects every `*.test.ts`).

## Checks

    bun install      # installs the tools and enables the pre-commit hook
    bun run check    # typecheck + lint + dead code + comment language + tests
    bun run fix      # applies Biome formatting and safe fixes

The pre-commit hook runs `bun run check`; a failing check blocks the commit.
