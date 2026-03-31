---
phase: 08-ast-based-dataweave-formatter
plan: 01
subsystem: testing
tags: [vitest, typescript, lexer, ast, dataweave, formatter]

requires:
  - phase: 07-jvm-sidecar
    provides: existing project structure and DataWeave execution architecture

provides:
  - dw-ast.ts: 24-node discriminated union AST type definitions with comment arrays
  - dw-lexer.ts: single-pass DataWeave lexer producing Token[] with 60+ token types
  - dw-lexer.test.ts: 75-test Vitest suite covering all token types and edge cases
  - vitest installed as devDependency with test script

affects:
  - 08-02 (parser will import TK, Token, lex from dw-lexer.ts and DWNode types from dw-ast.ts)
  - 08-03 (printer imports DWNode union for exhaustive switch dispatch)

tech-stack:
  added:
    - vitest ^4.1.2 (unit test runner, Vite-native)
  patterns:
    - const enum TK for zero-cost token type enum (inlined by TypeScript)
    - Discriminated union DWNode with kind string literal on every node interface
    - Depth-tracked string interpolation for $(expr) inside double-quoted strings
    - lastNonWsKind context tracking for regex disambiguation
    - Preserved whitespace/newline tokens for comment-attachment by parser

key-files:
  created:
    - src/renderer/src/lib/dw-ast.ts
    - src/renderer/src/lib/dw-lexer.ts
    - src/renderer/src/lib/__tests__/dw-lexer.test.ts
  modified:
    - package.json (added vitest devDependency and test script)
    - package-lock.json

key-decisions:
  - "Use const enum TK (not regular enum) for zero-cost token type representation at runtime"
  - "Preserve Whitespace and Newline as tokens (not skipped) so parser can use position for comment attachment"
  - "Store regex literals as TK.StringLit with /.../ value — avoids needing a separate Regex token kind"
  - "TripleDash is always emitted as a single token regardless of context — parser decides if it's the separator"

patterns-established:
  - "Pattern: Token = { kind: TK; value: string; line: number; col: number } — all lexer tokens"
  - "Pattern: DWNode discriminated union with kind field enables exhaustive switch in printer"
  - "Pattern: leadingComments/trailingComments on every node interface for comment preservation"

requirements-completed: []

duration: 4min
completed: 2026-03-31
---

# Phase 08 Plan 01: AST Type Definitions and Lexer Summary

**DataWeave lexer and AST type definitions: 60+ token types, 24 AST node kinds, depth-tracked string interpolation, 75 passing tests**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-31T19:25:35Z
- **Completed:** 2026-03-31T19:29:33Z
- **Tasks:** 2
- **Files created/modified:** 5

## Accomplishments

- Created `dw-ast.ts` with 24 discriminated union node types (DWDocument through DWConditionalExpr), all with `leadingComments`/`trailingComments` for comment preservation
- Created `dw-lexer.ts` with a single-pass lexer handling 60+ token types: keywords, operators, string interpolation with depth tracking, regex disambiguation, `%dw 2.0` as a single token, `---` as TripleDash
- Created 75-test Vitest suite covering punctuation, multi-char operators, string interpolation, comments, keywords, full scripts, and position tracking — all pass

## Task Commits

1. **Task 1: Create AST type definitions and Lexer** - `17d91a4` (feat)
2. **Task 2: Create lexer test suite with Vitest** - `8ec7a59` (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/renderer/src/lib/dw-ast.ts` — 24 discriminated union AST node interfaces + DWNode union type
- `src/renderer/src/lib/dw-lexer.ts` — Single-pass lexer: `export const enum TK`, `Token` interface, `lex(src)` function
- `src/renderer/src/lib/__tests__/dw-lexer.test.ts` — 75 Vitest tests across 11 describe groups
- `package.json` — Added `vitest ^4.1.2` devDependency + `"test": "vitest run"` script
- `package-lock.json` — Updated lockfile

## Decisions Made

- Used `const enum TK` (not `enum`) so token kind values are inlined at compile time with no runtime object allocation
- Whitespace and Newline preserved as tokens (not filtered) so the parser can use position information for leading/trailing comment attachment to AST nodes
- Regex literals stored as `TK.StringLit` with `/pattern/` value — avoids a dedicated `TK.Regex` kind while preserving the content
- `TripleDash` always emitted as a single token — parser determines if it's the header/body separator based on context

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `dw-ast.ts` exports all 24 node types and the `DWNode` union ready for the parser to construct
- `dw-lexer.ts` exports `TK`, `Token`, and `lex()` — the parser (Plan 02) imports these directly
- Vitest is installed and configured — Plan 02/03 test files will just work
- No blockers for Plan 02 (recursive-descent parser)

---
*Phase: 08-ast-based-dataweave-formatter*
*Completed: 2026-03-31*
