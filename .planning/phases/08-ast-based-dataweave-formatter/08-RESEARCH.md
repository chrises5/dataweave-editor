# Phase 8: AST-Based DataWeave Formatter - Research

**Researched:** 2026-03-31
**Domain:** Recursive-descent parsing, AST construction, pretty-printing — TypeScript, no external parser generators
**Confidence:** HIGH

## Summary

Phase 8 replaces the heuristic line-based formatter in `src/renderer/src/lib/dataweave-formatter.ts` (~330 lines of interacting flags) with a three-stage pipeline: **Lexer → Recursive-Descent Parser → Pretty-Printer**. All three stages live in the renderer process as pure TypeScript modules with zero new runtime dependencies.

The DataWeave grammar is fully documented in the MuleSoft IntelliJ plugin's `Weave.bnf` (BNF grammar file in the official repository). This is the authoritative reference for all ~15-20 constructs that affect formatting. The grammar is expression-oriented (every construct is an `Expression`) with binary operators, selectors, object/array literals, lambdas, pattern matching, do blocks, and header directives.

The standard architecture for this type of work is: (1) a **Lexer** that converts raw source into a flat `Token[]` array with token type and source position; (2) a **recursive-descent Parser** that uses a Pratt/TDOP loop for expression precedence and one `parseX()` function per grammar production; (3) a **pretty-printer** that walks the AST via a `print(node)` dispatch function returning a `Doc` intermediate representation, which is then rendered to a string using a Wadler-style line-fitting algorithm. The `Doc` algebra — `text`, `line`, `group`, `nest`, `concat` — is the critical abstraction that lets the printer declare *where* breaks are allowed without hard-coding line width.

**Primary recommendation:** Implement a hand-written lexer + Pratt-style recursive-descent parser + Doc-algebra pretty-printer, all in a single new file `src/renderer/src/lib/dataweave-formatter-v2.ts`. Wire it as a drop-in replacement for `formatDataWeave()`. No new npm packages needed.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (already in project) | 5.9.x | Lexer, parser, printer implementation | Discriminated unions (`{ kind: 'IfExpr', ... }`) give exhaustive `switch` coverage in the printer. Type errors surface missing cases at compile time. |
| Vitest | 2.x (not yet installed) | Unit tests for formatter | Already planned as the test framework for this project (CLAUDE.md). Zero-config with Vite. Snapshot tests are the natural fit for a formatter: `expect(format(input)).toMatchInlineSnapshot(...)`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | — | All three stages (lexer, parser, printer) are pure algorithms with no external dependencies. The Doc algebra is ~50 lines; a full Wadler renderer is ~80 lines. Copying them in is cheaper than an npm dependency. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written lexer | `tokenizr` npm package | `tokenizr` would reduce lexer boilerplate by ~50 lines but adds a dependency for a formatter that runs on every Cmd+Shift+F keystroke. Not worth it. |
| Hand-written Pratt parser | `nearley` or `chevrotain` | Parser generators produce correct parsers but require a separate grammar file, a build step, and knowledge of the tool. For a ~15-construct language the hand-written parser is shorter and easier to debug. |
| Doc-algebra printer | Simple string concatenation | String concatenation forces hard-coding line breaks. The Doc algebra makes `group(concat([text("if ("), print(cond), text(")"), line, print(then)]))` automatically try flat first then broken — this is the ONLY correct approach for a formatter that respects print width. |

**Installation:**
```bash
npm install --save-dev vitest
```

No other new packages required.

**Version verification:** Vitest 2.x is the current stable release (2025). Confirm before install:
```bash
npm view vitest version
```

## Architecture Patterns

### Recommended Project Structure
```
src/renderer/src/lib/
├── dataweave-formatter.ts       # Existing heuristic formatter (keep until V2 ships)
├── dataweave-formatter-v2.ts    # New entry point — exports formatDataWeave()
├── dw-lexer.ts                  # Stage 1: source text → Token[]
├── dw-ast.ts                    # AST node type definitions (discriminated unions)
├── dw-parser.ts                 # Stage 2: Token[] → DWDocument (AST root)
└── dw-printer.ts                # Stage 3: DWDocument → formatted string via Doc algebra
```

`dataweave-formatter-v2.ts` exposes the same `formatDataWeave(src: string): string` signature as the existing file. `ScriptPanel.tsx` switches its import with no other changes.

### Pattern 1: Token Type Enum + Lexer Class

**What:** A single-pass lexer that maintains position, recognises all DataWeave tokens, and produces `Token[]` with no back-tracking.
**When to use:** Always — the lexer is the foundation. It must handle: keywords (`var`, `fun`, `type`, `ns`, `import`, `input`, `output`, `if`, `else`, `match`, `case`, `do`, `using`, `default`, `as`, `is`, `and`, `or`, `not`), operators (`->`, `---`, `..`, `::`, `~=`, `<=`, `>=`, `++`, etc.), string literals (double-quoted with `$(...)` interpolation, single-quoted, backtick-quoted), number literals, identifiers, and `//` + `/* */` comments.

**Example:**
```typescript
// dw-lexer.ts
export const enum TK {
  // Literals
  Int, Float, StringLit, Bool, Null, Undefined,
  // Punctuation
  LBrace, RBrace, LBracket, RBracket, LParen, RParen,
  Comma, Colon, Dot, DotDot, Arrow, Eq, TripleDash,
  // Keywords
  KwVar, KwFun, KwType, KwNs, KwImport, KwInput, KwOutput,
  KwIf, KwElse, KwMatch, KwCase, KwDo, KwUsing, KwDefault,
  KwAs, KwIs, KwAnd, KwOr, KwNot, KwTrue, KwFalse, KwNull,
  // Operators
  Plus, Minus, Star, Slash, Bang, Tilde,
  EqEq, BangEq, TildeEq, Lt, LtEq, Gt, GtEq,
  PlusPlus, ColonColon, Hash, At,
  // Meta
  Ident, Comment, BlockComment, Newline, EOF,
}

export interface Token {
  kind: TK
  value: string
  line: number
  col: number
}

export function lex(src: string): Token[] { /* ... */ }
```

### Pattern 2: Discriminated Union AST Nodes

**What:** Every AST node is a TypeScript interface with a `kind` string literal field. The union `DWNode = DWDocument | DWIfExpr | DWLambda | ...` enables exhaustive `switch(node.kind)` in the printer.
**When to use:** Always. Avoid class hierarchies — plain objects are faster to construct and easier to serialize/debug.

**Example:**
```typescript
// dw-ast.ts
export type DWNode =
  | DWDocument
  | DWHeader
  | DWVarDirective
  | DWFunDirective
  | DWTypeDirective
  | DWNsDirective
  | DWImportDirective
  | DWInputDirective
  | DWOutputDirective
  | DWIfExpr
  | DWMatchExpr
  | DWDoExpr
  | DWUsingExpr
  | DWLambda
  | DWBinaryExpr
  | DWUnaryExpr
  | DWSelectorExpr
  | DWFunctionCall
  | DWObjectExpr
  | DWArrayExpr
  | DWEnclosedExpr
  | DWLiteral      // string, number, bool, null, undefined
  | DWIdentifier

export interface DWDocument { kind: 'Document'; header: DWHeader | null; body: DWNode }
export interface DWIfExpr   { kind: 'IfExpr'; cond: DWNode; then: DWNode; else: DWNode }
export interface DWLambda   { kind: 'Lambda'; params: DWParam[]; body: DWNode }
export interface DWBinaryExpr { kind: 'BinaryExpr'; op: string; left: DWNode; right: DWNode }
// ... one interface per node type
```

### Pattern 3: Pratt Parser for Expressions

**What:** Recursive-descent parser with a central `parseExpression(minPrec: number)` loop that handles all binary operators via a precedence table. Non-expression constructs (directives, match arms, object entries) use dedicated `parseX()` functions called from `parseExpression`.
**When to use:** The Pratt loop is the only practical way to handle DataWeave's 8+ binary operators with correct left-associativity without left-recursion in the grammar.

**Example:**
```typescript
// dw-parser.ts
const PREC: Record<string, number> = {
  'default': 10,
  'or':      20,
  'and':     30,
  '==': 40, '!=': 40, '~=': 40,
  '<': 50, '<=': 50, '>': 50, '>=': 50,
  '+': 60, '-': 60,
  '*': 70, '/': 70,
  'as': 80, 'is': 80,
  '.': 90, '..': 90,   // selectors
  '(':  95,            // function call
  '[':  95,            // bracket selector
}

function parseExpression(minPrec = 0): DWNode {
  let left = parsePrimary()
  while (true) {
    const op = peek()
    const prec = PREC[op.value] ?? -1
    if (prec <= minPrec) break
    advance()
    const right = parseExpression(prec)   // left-assoc: pass prec; right-assoc: pass prec-1
    left = { kind: 'BinaryExpr', op: op.value, left, right }
  }
  return left
}
```

### Pattern 4: Doc Algebra Pretty-Printer

**What:** The printer converts each AST node to a `Doc` value — a description of possible layouts. The `render(doc, width)` function then greedily fits tokens onto lines, inserting breaks when content would exceed `width` (default 80).
**When to use:** Always for a formatter. This is the architecture used by Prettier, dprint, and gofmt-style tools.

**The five Doc constructors:**
```typescript
// dw-printer.ts
type Doc =
  | string                                    // literal text, no breaks inside
  | { kind: 'concat'; parts: Doc[] }         // sequence — print all parts
  | { kind: 'nest';   indent: number; doc: Doc }  // indent contents by N spaces
  | { kind: 'line' }                         // break point: newline+indent OR space when flat
  | { kind: 'group'; doc: Doc }             // try flat first; if too wide, break all lines inside

// Helpers
const text  = (s: string): Doc => s
const line  = (): Doc => ({ kind: 'line' })
const concat = (...parts: Doc[]): Doc => ({ kind: 'concat', parts })
const nest   = (indent: number, doc: Doc): Doc => ({ kind: 'nest', indent, doc })
const group  = (doc: Doc): Doc => ({ kind: 'group', doc })

// Printer dispatch
function print(node: DWNode): Doc {
  switch (node.kind) {
    case 'Document':   return printDocument(node)
    case 'IfExpr':     return printIfExpr(node)
    case 'Lambda':     return printLambda(node)
    case 'BinaryExpr': return printBinaryExpr(node)
    case 'ObjectExpr': return printObject(node)
    case 'ArrayExpr':  return printArray(node)
    // ... one case per DWNode kind
    // TypeScript will warn (never) if any kind is unhandled
  }
}
```

**Doc renderer (Wadler algorithm, ~80 lines):**
```typescript
function render(doc: Doc, width = 80): string {
  // Two-pass: flatten check + emit.
  // See Wadler "A prettier printer" (1999) or lik.ai blog post for full impl.
  // Core: work list of (indent, mode:'flat'|'break', doc) tuples.
  // For 'group': try flat first; if it doesn't fit, switch to break mode.
  // For 'line': emit ' ' in flat mode, '\n' + indent in break mode.
}
```

### Anti-Patterns to Avoid
- **Tracking indentation with a numeric counter and flags:** This is exactly what the current formatter does. The Doc algebra is the replacement — never track "depth" as an int. The printer knows nothing about indentation; `nest` records it structurally.
- **Formatting by mutating the source text:** Never regex-replace inside the formatted string. The printer emits the entire output from scratch via AST walk.
- **Mixing lexing and parsing:** The lexer must complete first (`lex()` returns `Token[]`), then the parser runs. Interleaving them makes the codebase unmaintainable.
- **A single monolithic `parseExpression` that handles everything:** Keep directives, patterns, and type expressions in separate parse functions. Only binary/unary operators belong in the Pratt loop.
- **Ignoring comments:** Comments must be attached to AST nodes (leading/trailing) or stored in a parallel structure so the printer can re-emit them. Comments that are dropped by the formatter are a critical regression.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line-width-aware line breaking | Custom `if (line.length > 80)` hacks | Doc algebra `group`/`line` + Wadler renderer | Line-length decisions require knowing the combined width of all siblings in a group — you cannot determine this one token at a time. The Doc algebra defers the decision to `render()` which has global context. |
| Operator precedence | Nested `parseAddition → parseMultiplication → ...` functions | Pratt loop with precedence table | 8+ operators with a precedence-chain approach creates ~16 functions. The Pratt loop is 15 lines. |
| Comment preservation | Re-scan source for comments after parsing | Attach comments to AST nodes during lexing/parsing | Comments at arbitrary positions are lost if not explicitly tracked. The lexer must record comment tokens; the parser must attach them as `leadingComments`/`trailingComments` arrays on nodes. |
| String interpolation handling | Regex on formatted output | Lex interpolations as a nested token sequence in the lexer | String interpolations `$(expr)` contain nested DataWeave expressions. The lexer must handle depth-tracked `$(...)` inside double-quoted strings (same approach as the existing `tokenize()` function). |

**Key insight:** The Doc algebra is the biggest correctness win. Every pretty-printer bug in the current heuristic formatter can be traced back to not knowing the total width of a group when deciding whether to break it.

## Common Pitfalls

### Pitfall 1: Left Recursion in Expression Grammar
**What goes wrong:** Writing `parseBinaryExpr() { left = parseBinaryExpr(); ... }` causes infinite recursion. The Weave.bnf grammar is itself left-recursive in its binary expression rules.
**Why it happens:** The BNF grammar rules `OrExpression ::= Expression 'or' AndExpression` are written for a parser generator, not a hand-written recursive-descent parser.
**How to avoid:** Use the Pratt loop (Pattern 3 above). Parse the left-hand side with `parsePrimary()`, then loop consuming operators while their precedence exceeds `minPrec`.
**Warning signs:** Stack overflow during parsing of any multi-operator expression.

### Pitfall 2: Losing Comments
**What goes wrong:** The formatted output is missing all `//` and `/* */` comments.
**Why it happens:** A naïve AST walk skips comment tokens entirely.
**How to avoid:** The lexer must produce comment tokens (type `TK.Comment`, `TK.BlockComment`). The parser must attach comments encountered before/after a node to that node as `leadingComments[]`/`trailingComments[]`. The printer must emit them in `printX()` functions before/after the node's content.
**Warning signs:** Format a script with comments; verify output contains all comments verbatim.

### Pitfall 3: String Interpolation Breaking the Lexer
**What goes wrong:** The lexer exits a double-quoted string early when it encounters `)` inside `$(...)`.
**Why it happens:** Single-pass string lexing without depth-tracking treats `)` inside interpolation as string end.
**How to avoid:** Track interpolation depth exactly as the current `tokenize()` does: increment on `$(`, decrement on `)` when depth > 0, only end the string literal on `"` when depth == 0.
**Warning signs:** Lexer produces malformed tokens for `"Hello $(name)"` or `"$(a + b) items"`.

### Pitfall 4: Trailing Commas and Postfix Selectors Misidentified as Operators
**What goes wrong:** The `?` selector suffix (`expr?`) is parsed as the ternary `?` operator. The `!` selector suffix is parsed as logical NOT.
**Why it happens:** DataWeave overloads `?` and `!` as both postfix selectors and as independent operators in pattern matching.
**How to avoid:** In `parsePrimary()`, after parsing a primary expression, consume `?` and `!` when they appear as postfix with no space (or based on grammar context). Do not put `?` in the binary operator precedence table.
**Warning signs:** `payload.name?` parses incorrectly or triggers parse error.

### Pitfall 5: `---` Header/Body Separator vs. Comment
**What goes wrong:** `---` is treated as three minus operators instead of the header separator.
**Why it happens:** The lexer emits `Minus Minus Minus` tokens.
**How to avoid:** The lexer must recognise `---` as a distinct `TK.TripleDash` token. It must appear at depth 0 on its own line to be the separator — but the lexer can always emit `TripleDash` and let the parser decide context.
**Warning signs:** A script with a header (`%dw 2.0\noutput application/json\n---\n{}`) fails to parse the header correctly.

### Pitfall 6: Doc Algebra Quadratic Blowup
**What goes wrong:** The `render()` function is O(n²) or worse for large inputs.
**Why it happens:** The Wadler algorithm in its simplest form re-scans strings to compute length. For real DataWeave scripts (up to 500 lines) this is acceptable. For editor-triggered format-on-keystroke it is not.
**How to avoid:** Pre-compute `textLength(doc)` lazily or cache it. The Prettier codebase optimises this with a work-list iterator. For this phase, targeting <100ms on a 500-line script, the naïve implementation is acceptable.
**Warning signs:** Format taking > 200ms on scripts larger than 200 lines.

### Pitfall 7: Incomplete Grammar Coverage Causing Format-Then-Corrupt
**What goes wrong:** The formatter accepts a DataWeave script, parses it partially, and emits mangled output (e.g., dropping a match arm or misplacing an operator).
**Why it happens:** The parser does not handle all constructs and silently drops unknown tokens.
**How to avoid:** The parser must have explicit error handling: when it encounters an unexpected token it must either (a) throw a `ParseError` (safest — the formatter returns the original source unchanged) or (b) emit a `DWUnparsed` node containing the raw source slice. Option (a) is preferred.
**Warning signs:** Round-trip test fails: `formatDataWeave(formatDataWeave(src)) !== formatDataWeave(src)`.

## Code Examples

Verified patterns from official sources:

### Lexer: Handling `$(...)` String Interpolation
```typescript
// Source: derived from existing dataweave-formatter.ts tokenize() + Weave.bnf
function lexDoubleQuotedString(src: string, start: number): { end: number; value: string } {
  let j = start + 1  // skip opening "
  let depth = 0
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === '$' && src[j + 1] === '(') { depth++; j += 2; continue }
    if (depth > 0 && src[j] === '(') { depth++; j++; continue }
    if (depth > 0 && src[j] === ')') { depth--; j++; continue }
    if (depth === 0 && src[j] === '"') { j++; break }
    j++
  }
  return { end: j, value: src.slice(start, j) }
}
```

### Pratt Expression Parser Skeleton
```typescript
// Source: Pratt Parsing in TypeScript — https://www.less-bug.com/en/posts/pratt-parsing-introduction-and-implementation-in-typescript/
// Adapted for DataWeave operator set
const BINARY_PREC: Record<string, number> = {
  'default': 10,
  'or': 20, 'and': 30,
  '==': 40, '!=': 40, '~=': 40,
  '<': 50, '<=': 50, '>': 50, '>=': 50,
  '+': 60, '-': 60, '++': 65,
  '*': 70, '/': 70,
  'as': 80, 'is': 80,
}

function parseExpr(minPrec = 0): DWNode {
  let left = parsePrimary()         // atoms, unary, parenthesized, match, if, do, using, lambda
  while (true) {
    // Selectors bind tighter than binary ops — handle .  ..  [  (  ?  ! in parsePrimary suffix
    const op = peek()
    const prec = BINARY_PREC[op.value] ?? -1
    if (prec <= minPrec) break
    advance()
    const right = parseExpr(prec)   // left-associative; for right-assoc use prec - 1
    left = { kind: 'BinaryExpr', op: op.value, left, right }
  }
  return left
}
```

### Doc Algebra: Object Expression Formatting
```typescript
// Source: Wadler "A prettier printer" algorithm — https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf
// Also: https://lik.ai/blog/how-a-pretty-printer-works/
function printObject(node: DWObjectExpr): Doc {
  if (node.entries.length === 0) return text('{}')
  const entries = node.entries.map((e, i) => {
    const comma = i < node.entries.length - 1 ? text(',') : text('')
    return concat(printObjectEntry(e), comma)
  })
  // group: try { k: v, k2: v2 } on one line; if too wide, break each entry to its own line
  return group(
    concat(
      text('{'),
      nest(2, concat(line(), ...interleave(entries, line()))),
      line(),
      text('}')
    )
  )
}
```

### Vitest Snapshot Test for Formatter
```typescript
// src/renderer/src/lib/__tests__/dw-formatter.test.ts
import { describe, it, expect } from 'vitest'
import { formatDataWeave } from '../dataweave-formatter-v2'

describe('formatDataWeave', () => {
  it('formats a simple object expression', () => {
    expect(formatDataWeave('%dw 2.0\noutput application/json\n---\n{a:1,b:2}')).toMatchInlineSnapshot(`
      "%dw 2.0
      output application/json
      ---
      {
        a: 1,
        b: 2
      }
      "
    `)
  })

  it('is idempotent', () => {
    const src = '%dw 2.0\noutput application/json\n---\n{a: 1}'
    expect(formatDataWeave(formatDataWeave(src))).toBe(formatDataWeave(src))
  })
})
```

### Parser: Header Directive Dispatch
```typescript
// dw-parser.ts
function parseDirective(): DWNode {
  // peek at the keyword to choose the right sub-parser
  switch (peek().kind) {
    case TK.KwVar:    return parseVarDirective()
    case TK.KwFun:    return parseFunDirective()
    case TK.KwType:   return parseTypeDirective()
    case TK.KwNs:     return parseNsDirective()
    case TK.KwImport: return parseImportDirective()
    case TK.KwInput:  return parseInputDirective()
    case TK.KwOutput: return parseOutputDirective()
    default:          throw new ParseError(`Unexpected token in header: ${peek().value}`)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex-based formatters (Black for Python predecessor, etc.) | AST-based formatters (Prettier 2017, Black 2018, dprint 2020) | 2017-2020 | Regex formatters cannot correctly handle nested structures, operator precedence, or line-width-aware grouping. AST is the only correct foundation. |
| Wadler algorithm (1999) with functional lazy lists | Prettier's imperative work-list variant | 2017 | The core Doc algebra is identical; Prettier replaced Haskell-style lazy evaluation with an explicit stack for JS performance. |
| Separate parse passes for each construct | Unified Pratt expression parser | mid-2010s | Pratt parsing handles all binary operators, unary prefixes, and postfix operations in a single ~15-line loop. Standard in hand-written parsers since Bob Nystrom's 2011 article. |

**Deprecated/outdated:**
- The "line-by-line + bracket depth counter" approach (current `dataweave-formatter.ts`): Cannot correctly format multi-line expressions, binary operator chains, or inline lambdas. It confuses indentation depth with syntactic structure.
- Parser combinator libraries for single-language formatters: High cognitive overhead for little benefit when the target language is small and well-defined.

## Open Questions

1. **Comment attachment strategy**
   - What we know: Comments must not be dropped. The lexer must preserve them.
   - What's unclear: Whether to attach comments to AST nodes (leading/trailing arrays) or maintain a parallel comment map keyed by token position. The node-attachment approach is simpler; the position-map approach is more correct for comments between expression parts.
   - Recommendation: Use leading/trailing arrays on nodes for Phase 8 scope. Comments between object entries should be preserved as "comment entries" in the entries array.

2. **Parse error recovery vs. bail-out**
   - What we know: The formatter is triggered by Cmd+Shift+F on potentially incomplete/broken code.
   - What's unclear: Whether to recover from parse errors (complex, risky) or bail out and return the original source unchanged.
   - Recommendation: Bail out on parse error and return `src` unchanged. Add a `try/catch` in `formatDataWeave()`. This is the approach used by gofmt and Prettier — they refuse to format invalid code.

3. **DataWeave `update` expressions and type annotations**
   - What we know: The Weave.bnf includes `UpdateExpression` and complex type syntax. These are uncommon in practice.
   - What's unclear: Whether to implement them in Phase 8 or treat them as fallback-to-original cases.
   - Recommendation: Implement the 15 most common constructs in Phase 8. For unrecognised constructs, throw `ParseError` (triggers bail-out). Document remaining constructs as Phase 8 follow-up items.

## Sources

### Primary (HIGH confidence)
- [mulesoft/data-weave-intellij-plugin — Weave.bnf](https://github.com/mulesoft/data-weave-intellij-plugin/blob/master/data-weave-plugin/src/main/java/org/mule/tooling/lang/dw/parser/Weave.bnf) — complete DataWeave 2.0 grammar; all production rules verified
- [Philip Wadler — A prettier printer (1999)](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf) — Doc algebra and Wadler algorithm; the theoretical foundation for Prettier
- [James Long — A Prettier JavaScript Formatter (2017)](https://archive.jlongster.com/A-Prettier-Formatter) — Prettier's original architecture post; explains Doc + print function pattern
- [lik.ai — How a pretty printer works](https://lik.ai/blog/how-a-pretty-printer-works/) — TypeScript walkthrough of the Doc algebra with concat/nest/line/group semantics

### Secondary (MEDIUM confidence)
- [Pratt Parsing: Introduction and Implementation in TypeScript](https://www.less-bug.com/en/posts/pratt-parsing-introduction-and-implementation-in-typescript/) — TypeScript Pratt parser with precedence table and prefix/infix handler tables; verified consistent with matklad's canonical post
- [matklad — Simple but Powerful Pratt Parsing (2020)](https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html) — canonical reference for modern Pratt implementation style (in Rust, patterns apply to TypeScript)
- [Vitest documentation](https://vitest.dev/guide/snapshot) — snapshot testing confirmed, inline snapshots, current 2.x stable

### Tertiary (LOW confidence)
- WebSearch results on formatter pitfalls — confirmed by cross-referencing with Prettier source and official parser documentation; no single unverified claim included without verification

## Metadata

**Confidence breakdown:**
- Standard stack (TypeScript + Vitest): HIGH — both already in project or trivially added
- Architecture (Lexer/Pratt/Doc): HIGH — verified via Weave.bnf + Wadler paper + Prettier source analysis
- DataWeave grammar coverage: HIGH — sourced directly from official MuleSoft IntelliJ plugin Weave.bnf
- Pitfalls: HIGH — all directly observed from current formatter code or documented in parser literature

**Research date:** 2026-03-31
**Valid until:** 2026-06-01 (DataWeave grammar is stable; TypeScript and Vitest versions are stable)
