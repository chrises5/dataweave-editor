---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-04-01T14:13:11.335Z"
progress:
  total_phases: 9
  completed_phases: 7
  total_plans: 19
  completed_plans: 16
---

# Project State: DataWeave Editor

## Current Phase

Phase 9: Settings Menu, Keybindings & Editor Configuration (in progress, plan 01 of 02 complete)

## Accumulated Context

### Roadmap Evolution

- Phase 8 added: AST-based DataWeave Formatter — replace heuristic formatter with parser → AST → pretty-printer
- Phase 9 added: Settings Menu, Keybindings & Editor Configuration

### Phase 8 Progress

- Plan 01 complete: AST type definitions (dw-ast.ts) and lexer (dw-lexer.ts) implemented with 75-test Vitest suite
- Vitest installed as devDependency
- Plan 02 complete: Pratt parser (dw-parser.ts) and 53-test suite (dw-parser.test.ts)
- Plan 03 complete: Doc-algebra printer (dw-printer.ts), V2 entry point (dataweave-formatter-v2.ts), ScriptPanel wired, 28 end-to-end tests passing

### Decisions

- Use `const enum TK` for zero-cost token type enum (inlined by TypeScript)
- Preserve Whitespace/Newline tokens (not filtered) for comment-attachment in parser
- TripleDash always emitted as single token regardless of context
- Bracket access ([expr]) modeled as FunctionCall not SelectorExpr (DWSelectorExpr.selector is string, not DWNode)
- Keyword operators (as, is, and, or, default) mapped via getPrec()/getOpValue() helpers to avoid mixing TK kinds with string-keyed BINARY_PREC table
- match expression handled as special postfix in Pratt loop, not in precedence table
- ParseError bail-out strategy: no recovery, formatDataWeave caller catches and returns original source
- Added softline (empty in flat mode) Doc variant for tight {a:1} formatting without spaces
- %dw 2.0 hardcoded in Document printer when header is non-null (parser drops DwVersion token)
- [Phase 09]: Font size range clamped to 8-32, tabSize 1-8, autoRunDelay 200-5000ms

### Last session

- Stopped at: Completed 09-01-PLAN.md (2026-04-01)
