# Project State: DataWeave Editor

## Current Phase
Phase 7: JVM Sidecar for DataWeave Execution (in progress)

## Accumulated Context

### Roadmap Evolution
- Phase 8 added: AST-based DataWeave Formatter — replace heuristic formatter with parser → AST → pretty-printer

### Phase 8 Progress
- Plan 01 complete: AST type definitions (dw-ast.ts) and lexer (dw-lexer.ts) implemented with 75-test Vitest suite
- Vitest installed as devDependency

### Decisions
- Use `const enum TK` for zero-cost token type enum (inlined by TypeScript)
- Preserve Whitespace/Newline tokens (not filtered) for comment-attachment in parser
- TripleDash always emitted as single token regardless of context

### Last session
- Stopped at: Completed 08-01-PLAN.md (2026-03-31)
