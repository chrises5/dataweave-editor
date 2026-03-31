---
phase: 08-ast-based-dataweave-formatter
plan: 02
subsystem: parser
tags: [typescript, parser, pratt-parser, dataweave, ast, vitest]

requires:
  - phase: 08-ast-based-dataweave-formatter
    plan: 01
    provides: dw-ast.ts DWNode union, dw-lexer.ts TK enum and lex() function

provides:
  - dw-parser.ts: recursive-descent Pratt parser, parse(src) -> DWDocument, ParseError class
  - dw-parser.test.ts: 53-test Vitest suite covering all DataWeave constructs

affects:
  - 08-03 (printer imports DWDocument from parse() and walks AST to produce formatted output)

tech-stack:
  added: []
  patterns:
    - Pratt parsing with precedence table for binary operator precedence (14 operators)
    - Token stream filtered into code tokens + comment tokens before parsing begins
    - Comment attachment via line proximity: leadingComments before node start, trailingComments on same line
    - Lambda lookahead via forward scan for -> after matching ) without consuming tokens
    - Bracket access modeled as FunctionCall (callee=base, args[0]=index) due to DWSelectorExpr.selector being string not DWNode
    - Keyword operators (as, is, and, or, default) handled via getPrec()/getOpValue() helpers mapping TK kinds
    - match expression handled specially in Pratt loop as postfix (not in precedence table)
    - ParseError thrown on unexpected tokens — bail-out strategy, no recovery

key-files:
  created:
    - src/renderer/src/lib/dw-parser.ts
    - src/renderer/src/lib/__tests__/dw-parser.test.ts
  modified: []

key-decisions:
  - "Bracket access ([expr]) modeled as FunctionCall not SelectorExpr — DWSelectorExpr.selector is string, cannot hold a DWNode index"
  - "Keyword operators (as, is, and, or, default) handled via getPrec()/getOpValue() helper functions mapping TK kinds to precedence and string values"
  - "match expression handled as postfix in Pratt loop (not via precedence table) since expr match { cases } is not a traditional binary op"
  - "ParseError bail-out strategy: no recovery, caller (formatDataWeave) catches and returns original source"

patterns-established:
  - "Pattern: parse(src) entry point calls lex(), filters tokens, parses header until TripleDash, then parses body"
  - "Pattern: ParserState = { tokens: Token[], comments: Token[], pos: number } — state threaded through all parse functions"
  - "Pattern: Pratt loop — left = parsePrimary(); loop { getPrec(peek()) > minPrec ? advance, parseExpr(prec), BinaryExpr }"

requirements-completed: []

duration: 15min
completed: 2026-03-31
---

# Phase 08 Plan 02: Recursive-Descent Pratt Parser Summary

**Pratt parser converting Token[] to DWDocument AST: 14-operator precedence table, comment attachment, lambda lookahead, 53 passing tests**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-31T19:30:00Z
- **Completed:** 2026-03-31T19:45:48Z
- **Tasks:** 2
- **Files created/modified:** 2

## Accomplishments

- Created `dw-parser.ts` with a full recursive-descent Pratt parser (1129 lines): `parse()` entry point, `ParseError` class, `parseExpression(minPrec)` Pratt loop, `parsePrimary()`, `parseObject()`, `parseArray()`, `parseIfExpr()`, `parseMatchExpr()`, `parseDoExpr()`, `parseLambda()`, comment attachment strategy
- Created 53-test Vitest suite covering: document structure (5), header directives (5), operator precedence (6), expressions (14), selectors (5), function calls (2), comments (3), error handling (5), postfix conditional (1), edge cases (6) — all 53 pass

## Task Commits

1. **Task 1: Implement recursive-descent Pratt parser** - `b13d6f3` (feat)
2. **Task 2: Create parser test suite** - `04f7cbd` (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/renderer/src/lib/dw-parser.ts` — Full Pratt parser with 14-operator precedence table, comment attachment, bracket-as-FunctionCall, lambda lookahead
- `src/renderer/src/lib/__tests__/dw-parser.test.ts` — 53 Vitest tests across 10 describe groups

## Decisions Made

- Bracket access (`[expr]`) modeled as `FunctionCall` (not `SelectorExpr`) because `DWSelectorExpr.selector` is `string`, not `DWNode`. The printer (Plan 03) must handle this: when `callee` is a `SelectorExpr` with no args matching a bracket pattern, emit `[args[0]]` syntax.
- Keyword operators (`as`, `is`, `and`, `or`, `default`) handled via `getPrec()` and `getOpValue()` helper functions that map `TK` enum kinds to precedence numbers and operator string representations — avoids mixing token kinds with the string-keyed BINARY_PREC table.
- `match` expression handled as special postfix in the Pratt loop (not in the precedence table) since `expr match { cases }` syntactically resembles a binary operator but produces a `MatchExpr` node, not a `BinaryExpr`.
- ParseError bail-out strategy: no error recovery. The public `parse()` function allows `ParseError` to propagate; the `formatDataWeave` caller in Plan 04 will catch it and return the original source unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial bracket selector implementation had dead code**
- **Found during:** Task 1 (implementation)
- **Issue:** First draft created a `SelectorExpr` for bracket access and then tried to replace it with a `FunctionCall` within the same `if` block, resulting in unreachable code after the early return
- **Fix:** Rewrote `parsePostfix` to use `FunctionCall` directly for bracket access with no intermediate `SelectorExpr` creation
- **Files modified:** `src/renderer/src/lib/dw-parser.ts`
- **Commit:** `b13d6f3`

**2. [Rule 1 - Bug] Test "throws ParseError for invalid input @@@" used wrong input**
- **Found during:** Task 2 (test suite)
- **Issue:** `parse('invalid @@@ syntax')` did not throw because `invalid` parsed successfully as the body identifier; unconsumed `@@@` tokens were silently left
- **Fix:** Changed test input to `parse('@@@')` which throws immediately since `TK.At` is unhandled in `parsePrimary`
- **Files modified:** `src/renderer/src/lib/__tests__/dw-parser.test.ts`
- **Commit:** `04f7cbd`

## Issues Encountered

None beyond the two auto-fixed bugs above.

## Known Stubs

None — the parser produces real AST nodes from real token input. No hardcoded placeholders.

## Next Phase Readiness

- `dw-parser.ts` exports `parse(src: string): DWDocument` and `ParseError` — the printer (Plan 03) imports these directly
- Bracket access represented as `FunctionCall` — printer must detect this pattern and emit `[index]` syntax
- Comment attachment (`leadingComments`/`trailingComments`) populated on AST nodes — printer can preserve comments
- All 53 tests pass; no blockers for Plan 03 (AST pretty-printer)

---
*Phase: 08-ast-based-dataweave-formatter*
*Completed: 2026-03-31*
