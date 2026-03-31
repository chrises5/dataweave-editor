# Project State: DataWeave Editor

## Current Phase
Phase 7: JVM Sidecar for DataWeave Execution (in progress)

## Accumulated Context

### Roadmap Evolution
- Phase 8 added: AST-based DataWeave Formatter — replace heuristic formatter with parser → AST → pretty-printer

### Phase 8 Progress
- Plan 01 complete: AST type definitions (dw-ast.ts) and lexer (dw-lexer.ts) implemented with 75-test Vitest suite
- Vitest installed as devDependency
- Plan 02 complete: Pratt parser (dw-parser.ts) and 53-test suite (dw-parser.test.ts)

### Decisions
- Use `const enum TK` for zero-cost token type enum (inlined by TypeScript)
- Preserve Whitespace/Newline tokens (not filtered) for comment-attachment in parser
- TripleDash always emitted as single token regardless of context
- Bracket access ([expr]) modeled as FunctionCall not SelectorExpr (DWSelectorExpr.selector is string, not DWNode)
- Keyword operators (as, is, and, or, default) mapped via getPrec()/getOpValue() helpers to avoid mixing TK kinds with string-keyed BINARY_PREC table
- match expression handled as special postfix in Pratt loop, not in precedence table
- ParseError bail-out strategy: no recovery, formatDataWeave caller catches and returns original source

### Last session
- Stopped at: Completed 08-02-PLAN.md (2026-03-31)
