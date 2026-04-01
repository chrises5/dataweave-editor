// DataWeave Lexer — Stage 1 of the AST-based formatter pipeline
// Converts raw DataWeave source text into a flat Token[] array.
//
// Design notes:
// - Single-pass, no backtracking.
// - Whitespace and newlines are preserved as tokens (the parser filters them).
//   This is required so comment-attachment logic can use position information.
// - `---` is a distinct TK.TripleDash token (not three TK.Minus tokens).
// - Double-quoted strings handle `$(...)` interpolation with depth tracking.
// - Comments are preserved as tokens (TK.Comment and TK.BlockComment).
// - `%dw <version>` is a single TK.DwVersion token.
// - Line and column numbers are 1-based.

// ─── Token Kind Enum ──────────────────────────────────────────────────────────

// Use const enum for zero-cost at runtime (inlined by TypeScript compiler).
export const enum TK {
  // Literals
  Int,
  Float,
  StringLit,
  Bool,
  Null,

  // Grouping / punctuation
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  LParen,
  RParen,
  Comma,
  Colon,
  Dot,
  DotDot,
  Arrow,
  Eq,
  TripleDash,
  Semicolon,
  Pipe,

  // Header keywords
  KwVar,
  KwFun,
  KwType,
  KwNs,
  KwImport,
  KwInput,
  KwOutput,

  // Expression keywords
  KwIf,
  KwElse,
  KwMatch,
  KwCase,
  KwDo,
  KwUsing,
  KwDefault,
  KwAs,
  KwIs,
  KwNot,
  KwAnd,
  KwOr,
  KwTrue,
  KwFalse,
  KwNull,
  KwUnless,
  KwUpdate,

  // Meta / version
  Percent,
  DwVersion,

  // Single-character operators
  Plus,
  Minus,
  Star,
  Slash,
  Bang,
  Tilde,
  Question,
  At,
  Hash,
  Caret,

  // Multi-character operators
  EqEq,
  BangEq,
  TildeEq,
  Lt,
  LtEq,
  Gt,
  GtEq,
  PlusPlus,
  MinusMinus,

  // Identifiers and comments
  Ident,
  Comment,
  BlockComment,

  // Whitespace (preserved for comment-attachment)
  Newline,
  Whitespace,

  // Sentinel
  EOF,
}

// ─── Token Interface ──────────────────────────────────────────────────────────

export interface Token {
  kind: TK
  value: string
  line: number
  col: number
}

// ─── Keyword Map ──────────────────────────────────────────────────────────────

const KEYWORDS = new Map<string, TK>([
  ['var', TK.KwVar],
  ['fun', TK.KwFun],
  ['type', TK.KwType],
  ['ns', TK.KwNs],
  ['import', TK.KwImport],
  ['input', TK.KwInput],
  ['output', TK.KwOutput],
  ['if', TK.KwIf],
  ['else', TK.KwElse],
  ['match', TK.KwMatch],
  ['case', TK.KwCase],
  ['do', TK.KwDo],
  ['using', TK.KwUsing],
  ['default', TK.KwDefault],
  ['as', TK.KwAs],
  ['is', TK.KwIs],
  ['not', TK.KwNot],
  ['and', TK.KwAnd],
  ['or', TK.KwOr],
  ['true', TK.KwTrue],
  ['false', TK.KwFalse],
  ['null', TK.KwNull],
  ['unless', TK.KwUnless],
  ['update', TK.KwUpdate],
])

// ─── Lexer ────────────────────────────────────────────────────────────────────

export function lex(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1

  // Helper: advance position and update line/col tracking
  function advance(count = 1): void {
    for (let k = 0; k < count; k++) {
      if (i < src.length) {
        if (src[i] === '\n') {
          line++
          col = 1
        } else {
          col++
        }
        i++
      }
    }
  }

  // Helper: push a token with the current start position
  function push(kind: TK, value: string, startLine: number, startCol: number): void {
    tokens.push({ kind, value, line: startLine, col: startCol })
  }

  // Helper: peek ahead without consuming
  function peek(offset = 0): string {
    return i + offset < src.length ? src[i + offset] : ''
  }

  // Helper: is char a digit?
  function isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9'
  }

  // Helper: is char valid identifier start?
  function isIdentStart(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$'
  }

  // Helper: is char valid identifier continuation?
  function isIdentCont(ch: string): boolean {
    return isIdentStart(ch) || isDigit(ch)
  }

  // Track last non-whitespace/comment token kind for regex disambiguation
  let lastNonWsKind: TK | null = null

  while (i < src.length) {
    const startLine = line
    const startCol = col
    const ch = src[i]

    // ── Newline ────────────────────────────────────────────────────────────
    if (ch === '\n') {
      push(TK.Newline, '\n', startLine, startCol)
      advance()
      continue
    }

    // ── Whitespace (spaces and tabs) ───────────────────────────────────────
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      let j = i
      while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) {
        j++
      }
      const ws = src.slice(i, j)
      push(TK.Whitespace, ws, startLine, startCol)
      advance(ws.length)
      continue
    }

    // ── Block comment /* ... */ ────────────────────────────────────────────
    if (ch === '/' && peek(1) === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      const val = src.slice(i, stop)
      // Compute final line/col by scanning through the comment text
      const commentStartLine = startLine
      const commentStartCol = startCol
      // We must advance character-by-character to keep line/col in sync
      advance(val.length)
      push(TK.BlockComment, val, commentStartLine, commentStartCol)
      lastNonWsKind = TK.BlockComment
      continue
    }

    // ── Line comment // ... ────────────────────────────────────────────────
    if (ch === '/' && peek(1) === '/') {
      let j = i
      while (j < src.length && src[j] !== '\n') {
        j++
      }
      const val = src.slice(i, j)
      advance(val.length)
      push(TK.Comment, val, startLine, startCol)
      lastNonWsKind = TK.Comment
      continue
    }

    // ── Slash (division or regex) ──────────────────────────────────────────
    if (ch === '/') {
      // Decide if this is a regex literal based on context.
      // Regex follows: start of expression, operator, comma, open bracket/paren/brace,
      // or assignment. NOT after identifier, number, ), ], or }.
      // After an identifier, `/` is regex if immediately followed by a regex-start
      // character (e.g. `matches /[pattern]/`). NOT regex if followed by a letter
      // (e.g. `application/json`) or space (e.g. `a / b` division).
      const nextCh = i + 1 < src.length ? src[i + 1] : ''
      const isRegexStart = nextCh !== '' && !/[a-zA-Z0-9_ \t\n]/.test(nextCh)
      const isRegexAfterIdent = lastNonWsKind === TK.Ident && isRegexStart
      const isRegexContext =
        isRegexAfterIdent ||
        lastNonWsKind === null ||
        lastNonWsKind === TK.Eq ||
        lastNonWsKind === TK.EqEq ||
        lastNonWsKind === TK.BangEq ||
        lastNonWsKind === TK.TildeEq ||
        lastNonWsKind === TK.Comma ||
        lastNonWsKind === TK.LParen ||
        lastNonWsKind === TK.LBracket ||
        lastNonWsKind === TK.LBrace ||
        lastNonWsKind === TK.Arrow ||
        lastNonWsKind === TK.Colon ||
        lastNonWsKind === TK.KwIf ||
        lastNonWsKind === TK.KwElse ||
        lastNonWsKind === TK.KwCase ||
        lastNonWsKind === TK.KwMatch ||
        lastNonWsKind === TK.Bang ||
        lastNonWsKind === TK.Plus ||
        lastNonWsKind === TK.Minus ||
        lastNonWsKind === TK.Star ||
        lastNonWsKind === TK.Lt ||
        lastNonWsKind === TK.Gt ||
        lastNonWsKind === TK.LtEq ||
        lastNonWsKind === TK.GtEq

      if (isRegexContext) {
        let j = i + 1
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue }
          if (src[j] === '/') { j++; break }
          if (src[j] === '\n') break
          j++
        }
        const val = src.slice(i, j)
        advance(val.length)
        push(TK.StringLit, val, startLine, startCol) // regex stored as StringLit with /.../ value
        lastNonWsKind = TK.StringLit
        continue
      }

      push(TK.Slash, '/', startLine, startCol)
      advance()
      lastNonWsKind = TK.Slash
      continue
    }

    // ── %dw version ────────────────────────────────────────────────────────
    if (ch === '%') {
      if (src.slice(i, i + 3) === '%dw') {
        // Consume %dw + optional whitespace + version number
        let j = i + 3
        // skip whitespace
        while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j++
        // consume version (digits and dots)
        while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++
        const val = src.slice(i, j)
        advance(val.length)
        push(TK.DwVersion, val, startLine, startCol)
        lastNonWsKind = TK.DwVersion
        continue
      }
      push(TK.Percent, '%', startLine, startCol)
      advance()
      lastNonWsKind = TK.Percent
      continue
    }

    // ── Double-quoted string with interpolation ────────────────────────────
    if (ch === '"') {
      let j = i + 1
      let depth = 0
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '$' && src[j + 1] === '(') { depth++; j += 2; continue }
        if (depth > 0 && src[j] === '(') { depth++; j++; continue }
        if (depth > 0 && src[j] === ')') { depth--; j++; continue }
        if (depth === 0 && src[j] === '"') { j++; break }
        j++
      }
      const val = src.slice(i, j)
      advance(val.length)
      push(TK.StringLit, val, startLine, startCol)
      lastNonWsKind = TK.StringLit
      continue
    }

    // ── Single-quoted string ───────────────────────────────────────────────
    if (ch === "'") {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === "'") { j++; break }
        j++
      }
      const val = src.slice(i, j)
      advance(val.length)
      push(TK.StringLit, val, startLine, startCol)
      lastNonWsKind = TK.StringLit
      continue
    }

    // ── Numbers ────────────────────────────────────────────────────────────
    if (isDigit(ch) || (ch === '-' && isDigit(peek(1)) && (lastNonWsKind === null || lastNonWsKind === TK.Eq || lastNonWsKind === TK.Comma || lastNonWsKind === TK.LParen || lastNonWsKind === TK.LBracket || lastNonWsKind === TK.Colon || lastNonWsKind === TK.Arrow))) {
      let j = i
      if (src[j] === '-') j++ // optional leading minus for negative literals
      while (j < src.length && isDigit(src[j])) j++
      let isFloat = false
      if (j < src.length && src[j] === '.' && isDigit(src[j + 1] ?? '')) {
        isFloat = true
        j++ // consume dot
        while (j < src.length && isDigit(src[j])) j++
      }
      // Optional exponent
      if (j < src.length && (src[j] === 'e' || src[j] === 'E')) {
        isFloat = true
        j++
        if (j < src.length && (src[j] === '+' || src[j] === '-')) j++
        while (j < src.length && isDigit(src[j])) j++
      }
      const val = src.slice(i, j)
      advance(val.length)
      push(isFloat ? TK.Float : TK.Int, val, startLine, startCol)
      lastNonWsKind = isFloat ? TK.Float : TK.Int
      continue
    }

    // ── Identifiers and keywords ───────────────────────────────────────────
    if (isIdentStart(ch)) {
      let j = i
      while (j < src.length && isIdentCont(src[j])) j++
      const val = src.slice(i, j)
      advance(val.length)
      const kwKind = KEYWORDS.get(val)
      if (kwKind !== undefined) {
        // true/false are Bool tokens, null is Null token
        if (kwKind === TK.KwTrue || kwKind === TK.KwFalse) {
          push(TK.Bool, val, startLine, startCol)
          lastNonWsKind = TK.Bool
        } else if (kwKind === TK.KwNull) {
          push(TK.Null, val, startLine, startCol)
          lastNonWsKind = TK.Null
        } else {
          push(kwKind, val, startLine, startCol)
          lastNonWsKind = kwKind
        }
      } else {
        push(TK.Ident, val, startLine, startCol)
        lastNonWsKind = TK.Ident
      }
      continue
    }

    // ── Multi-character operators (must check before single-char) ─────────
    // `---` — triple dash (header/body separator)
    if (ch === '-' && peek(1) === '-' && peek(2) === '-') {
      push(TK.TripleDash, '---', startLine, startCol)
      advance(3)
      lastNonWsKind = TK.TripleDash
      continue
    }

    // `->` arrow
    if (ch === '-' && peek(1) === '>') {
      push(TK.Arrow, '->', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.Arrow
      continue
    }

    // `--` decrement
    if (ch === '-' && peek(1) === '-') {
      push(TK.MinusMinus, '--', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.MinusMinus
      continue
    }

    // `++` increment / string concat
    if (ch === '+' && peek(1) === '+') {
      push(TK.PlusPlus, '++', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.PlusPlus
      continue
    }

    // `==`
    if (ch === '=' && peek(1) === '=') {
      push(TK.EqEq, '==', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.EqEq
      continue
    }

    // `!=`
    if (ch === '!' && peek(1) === '=') {
      push(TK.BangEq, '!=', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.BangEq
      continue
    }

    // `~=`
    if (ch === '~' && peek(1) === '=') {
      push(TK.TildeEq, '~=', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.TildeEq
      continue
    }

    // `<=`
    if (ch === '<' && peek(1) === '=') {
      push(TK.LtEq, '<=', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.LtEq
      continue
    }

    // `>=`
    if (ch === '>' && peek(1) === '=') {
      push(TK.GtEq, '>=', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.GtEq
      continue
    }

    // `..` double dot
    if (ch === '.' && peek(1) === '.') {
      push(TK.DotDot, '..', startLine, startCol)
      advance(2)
      lastNonWsKind = TK.DotDot
      continue
    }

    // ── Single-character operators ─────────────────────────────────────────
    switch (ch) {
      case '{': push(TK.LBrace, '{', startLine, startCol); advance(); lastNonWsKind = TK.LBrace; break
      case '}': push(TK.RBrace, '}', startLine, startCol); advance(); lastNonWsKind = TK.RBrace; break
      case '[': push(TK.LBracket, '[', startLine, startCol); advance(); lastNonWsKind = TK.LBracket; break
      case ']': push(TK.RBracket, ']', startLine, startCol); advance(); lastNonWsKind = TK.RBracket; break
      case '(': push(TK.LParen, '(', startLine, startCol); advance(); lastNonWsKind = TK.LParen; break
      case ')': push(TK.RParen, ')', startLine, startCol); advance(); lastNonWsKind = TK.RParen; break
      case ',': push(TK.Comma, ',', startLine, startCol); advance(); lastNonWsKind = TK.Comma; break
      case ':': push(TK.Colon, ':', startLine, startCol); advance(); lastNonWsKind = TK.Colon; break
      case '.': push(TK.Dot, '.', startLine, startCol); advance(); lastNonWsKind = TK.Dot; break
      case '=': push(TK.Eq, '=', startLine, startCol); advance(); lastNonWsKind = TK.Eq; break
      case ';': push(TK.Semicolon, ';', startLine, startCol); advance(); lastNonWsKind = TK.Semicolon; break
      case '|': {
        // Check for date/time literal: |2024-10-03|, |12:00:00Z|, etc.
        // Date/time literals start with | followed by a digit
        if (isDigit(peek(1))) {
          let j = i + 1
          while (j < src.length && src[j] !== '|' && src[j] !== '\n') j++
          if (j < src.length && src[j] === '|') {
            j++ // consume closing |
            const val = src.slice(i, j)
            advance(val.length)
            push(TK.StringLit, val, startLine, startCol) // store as StringLit with |...| value
            lastNonWsKind = TK.StringLit
            break
          }
        }
        push(TK.Pipe, '|', startLine, startCol); advance(); lastNonWsKind = TK.Pipe; break
      }
      case '+': push(TK.Plus, '+', startLine, startCol); advance(); lastNonWsKind = TK.Plus; break
      case '-': push(TK.Minus, '-', startLine, startCol); advance(); lastNonWsKind = TK.Minus; break
      case '*': push(TK.Star, '*', startLine, startCol); advance(); lastNonWsKind = TK.Star; break
      case '!': push(TK.Bang, '!', startLine, startCol); advance(); lastNonWsKind = TK.Bang; break
      case '~': push(TK.Tilde, '~', startLine, startCol); advance(); lastNonWsKind = TK.Tilde; break
      case '?': push(TK.Question, '?', startLine, startCol); advance(); lastNonWsKind = TK.Question; break
      case '@': push(TK.At, '@', startLine, startCol); advance(); lastNonWsKind = TK.At; break
      case '#': push(TK.Hash, '#', startLine, startCol); advance(); lastNonWsKind = TK.Hash; break
      case '^': push(TK.Caret, '^', startLine, startCol); advance(); lastNonWsKind = TK.Caret; break
      case '<': push(TK.Lt, '<', startLine, startCol); advance(); lastNonWsKind = TK.Lt; break
      case '>': push(TK.Gt, '>', startLine, startCol); advance(); lastNonWsKind = TK.Gt; break
      default:
        // Unknown character — skip it to avoid infinite loops
        advance()
        break
    }
  }

  push(TK.EOF, '', line, col)
  return tokens
}
