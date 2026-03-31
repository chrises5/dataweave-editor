import { describe, it, expect } from 'vitest'
import { TK, lex } from '../dw-lexer'

/**
 * Helper: returns only the token kinds (filtering out Whitespace and Newline)
 * for concise assertions.
 */
function kinds(src: string): TK[] {
  return lex(src)
    .filter((t) => t.kind !== TK.Whitespace && t.kind !== TK.Newline)
    .map((t) => t.kind)
}

/**
 * Helper: returns only the token kinds AND values (filtering out Whitespace and Newline).
 */
function tokens(src: string): Array<{ kind: TK; value: string }> {
  return lex(src)
    .filter((t) => t.kind !== TK.Whitespace && t.kind !== TK.Newline)
    .map((t) => ({ kind: t.kind, value: t.value }))
}

describe('Lexer', () => {
  // ─── 1. Punctuation ─────────────────────────────────────────────────────────

  describe('punctuation', () => {
    it('lexes empty braces {}', () => {
      expect(kinds('{}')).toEqual([TK.LBrace, TK.RBrace, TK.EOF])
    })

    it('lexes brackets []', () => {
      expect(kinds('[]')).toEqual([TK.LBracket, TK.RBracket, TK.EOF])
    })

    it('lexes parens ()', () => {
      expect(kinds('()')).toEqual([TK.LParen, TK.RParen, TK.EOF])
    })

    it('lexes comma', () => {
      expect(kinds(',')).toEqual([TK.Comma, TK.EOF])
    })

    it('lexes colon', () => {
      expect(kinds(':')).toEqual([TK.Colon, TK.EOF])
    })

    it('lexes single dot', () => {
      expect(kinds('.')).toEqual([TK.Dot, TK.EOF])
    })

    it('lexes semicolon', () => {
      expect(kinds(';')).toEqual([TK.Semicolon, TK.EOF])
    })

    it('lexes pipe', () => {
      expect(kinds('|')).toEqual([TK.Pipe, TK.EOF])
    })
  })

  // ─── 2. Multi-character operators ──────────────────────────────────────────

  describe('multi-char operators', () => {
    it('lexes --- as TripleDash (not three Minus tokens)', () => {
      expect(kinds('---')).toEqual([TK.TripleDash, TK.EOF])
    })

    it('lexes -> as Arrow', () => {
      expect(kinds('->')).toEqual([TK.Arrow, TK.EOF])
    })

    it('lexes .. as DotDot', () => {
      expect(kinds('..')).toEqual([TK.DotDot, TK.EOF])
    })

    it('lexes ++ as PlusPlus', () => {
      expect(kinds('++')).toEqual([TK.PlusPlus, TK.EOF])
    })

    it('lexes -- as MinusMinus', () => {
      expect(kinds('--')).toEqual([TK.MinusMinus, TK.EOF])
    })

    it('lexes == as EqEq', () => {
      expect(kinds('==')).toEqual([TK.EqEq, TK.EOF])
    })

    it('lexes != as BangEq', () => {
      expect(kinds('!=')).toEqual([TK.BangEq, TK.EOF])
    })

    it('lexes ~= as TildeEq', () => {
      expect(kinds('~=')).toEqual([TK.TildeEq, TK.EOF])
    })

    it('lexes <= as LtEq', () => {
      expect(kinds('<=')).toEqual([TK.LtEq, TK.EOF])
    })

    it('lexes >= as GtEq', () => {
      expect(kinds('>=')).toEqual([TK.GtEq, TK.EOF])
    })

    it('--- followed by content: header separator then body', () => {
      // e.g. "---\n{}" should produce TripleDash then LBrace RBrace EOF
      expect(kinds('---\n{}')).toEqual([TK.TripleDash, TK.LBrace, TK.RBrace, TK.EOF])
    })

    it('-- is MinusMinus not TripleDash', () => {
      expect(kinds('--')).not.toEqual([TK.TripleDash, TK.EOF])
    })
  })

  // ─── 3. String literals ─────────────────────────────────────────────────────

  describe('string literals', () => {
    it('lexes a simple double-quoted string as one token', () => {
      expect(kinds('"hello"')).toEqual([TK.StringLit, TK.EOF])
    })

    it('lexes string with interpolation $(name) as single token', () => {
      const result = kinds('"hello $(name)"')
      expect(result).toEqual([TK.StringLit, TK.EOF])
    })

    it('lexes string with expression interpolation $(a + b) as single token', () => {
      expect(kinds('"$(a + b) items"')).toEqual([TK.StringLit, TK.EOF])
    })

    it('lexes string with nested parens in interpolation', () => {
      // "$(foo(bar))" — the ) inside foo(bar) must not end the string early
      expect(kinds('"$(foo(bar))"')).toEqual([TK.StringLit, TK.EOF])
    })

    it('lexes string with multiple interpolations', () => {
      expect(kinds('"$(a) and $(b)"')).toEqual([TK.StringLit, TK.EOF])
    })

    it('lexes single-quoted string as one token', () => {
      expect(kinds("'hello'")).toEqual([TK.StringLit, TK.EOF])
    })

    it('lexes single-quoted string with escape', () => {
      expect(kinds("'it\\'s'")).toEqual([TK.StringLit, TK.EOF])
    })

    it('preserves full string value including quotes', () => {
      const t = lex('"hello"').filter((t) => t.kind === TK.StringLit)
      expect(t[0].value).toBe('"hello"')
    })

    it('preserves full string value with interpolation', () => {
      const t = lex('"$(name)"').filter((t) => t.kind === TK.StringLit)
      expect(t[0].value).toBe('"$(name)"')
    })
  })

  // ─── 4. Comments ────────────────────────────────────────────────────────────

  describe('comments', () => {
    it('lexes line comment // as TK.Comment', () => {
      expect(kinds('// comment')).toEqual([TK.Comment, TK.EOF])
    })

    it('line comment does not include the trailing newline', () => {
      const allTokens = lex('// comment\ncode')
      const commentToken = allTokens.find((t) => t.kind === TK.Comment)!
      expect(commentToken.value).toBe('// comment')
      expect(commentToken.value).not.toContain('\n')
    })

    it('lexes line comment followed by newline and code', () => {
      expect(kinds('// comment\ncode')).toEqual([TK.Comment, TK.Ident, TK.EOF])
    })

    it('lexes block comment /* */ as TK.BlockComment', () => {
      expect(kinds('/* block */')).toEqual([TK.BlockComment, TK.EOF])
    })

    it('block comment preserves full text', () => {
      const t = lex('/* hello world */').find((t) => t.kind === TK.BlockComment)!
      expect(t.value).toBe('/* hello world */')
    })

    it('block comment can span multiple lines', () => {
      expect(kinds('/* line1\nline2 */')).toEqual([TK.BlockComment, TK.EOF])
    })

    it('preserves line comment value with // prefix', () => {
      const t = lex('// my comment').find((t) => t.kind === TK.Comment)!
      expect(t.value).toBe('// my comment')
    })
  })

  // ─── 5. Keywords ────────────────────────────────────────────────────────────

  describe('keywords', () => {
    it('recognizes var', () => {
      expect(kinds('var')).toEqual([TK.KwVar, TK.EOF])
    })

    it('recognizes fun', () => {
      expect(kinds('fun')).toEqual([TK.KwFun, TK.EOF])
    })

    it('recognizes type', () => {
      expect(kinds('type')).toEqual([TK.KwType, TK.EOF])
    })

    it('recognizes ns', () => {
      expect(kinds('ns')).toEqual([TK.KwNs, TK.EOF])
    })

    it('recognizes import', () => {
      expect(kinds('import')).toEqual([TK.KwImport, TK.EOF])
    })

    it('recognizes if else match case do using default as is and or not', () => {
      const src = 'if else match case do using default as is and or not'
      const k = kinds(src)
      expect(k).toEqual([
        TK.KwIf,
        TK.KwElse,
        TK.KwMatch,
        TK.KwCase,
        TK.KwDo,
        TK.KwUsing,
        TK.KwDefault,
        TK.KwAs,
        TK.KwIs,
        TK.KwAnd,
        TK.KwOr,
        TK.KwNot,
        TK.EOF,
      ])
    })

    it('recognizes unless and update', () => {
      const k = kinds('unless update')
      expect(k).toEqual([TK.KwUnless, TK.KwUpdate, TK.EOF])
    })

    it('true and false produce Bool tokens', () => {
      expect(kinds('true false')).toEqual([TK.Bool, TK.Bool, TK.EOF])
    })

    it('null produces Null token', () => {
      expect(kinds('null')).toEqual([TK.Null, TK.EOF])
    })

    it('identifier that starts with keyword is treated as ident', () => {
      // "variable" starts with "var" but is an identifier
      expect(kinds('variable')).toEqual([TK.Ident, TK.EOF])
    })
  })

  // ─── 6. Identifiers and literals ────────────────────────────────────────────

  describe('identifiers and literals', () => {
    it('lexes an identifier', () => {
      expect(kinds('payload')).toEqual([TK.Ident, TK.EOF])
    })

    it('lexes an integer', () => {
      expect(kinds('42')).toEqual([TK.Int, TK.EOF])
    })

    it('lexes zero', () => {
      expect(kinds('0')).toEqual([TK.Int, TK.EOF])
    })

    it('lexes a float', () => {
      expect(kinds('1.5')).toEqual([TK.Float, TK.EOF])
    })

    it('lexes a float with exponent', () => {
      expect(kinds('1.5e10')).toEqual([TK.Float, TK.EOF])
    })

    it('lexes payload.name as Ident Dot Ident', () => {
      expect(kinds('payload.name')).toEqual([TK.Ident, TK.Dot, TK.Ident, TK.EOF])
    })

    it('lexes camelCase identifiers', () => {
      expect(kinds('myVariable')).toEqual([TK.Ident, TK.EOF])
    })

    it('lexes underscore-prefixed identifiers', () => {
      expect(kinds('_private')).toEqual([TK.Ident, TK.EOF])
    })
  })

  // ─── 7. Header tokens ───────────────────────────────────────────────────────

  describe('header tokens', () => {
    it('lexes %dw 2.0 as a single DwVersion token', () => {
      expect(kinds('%dw 2.0')).toEqual([TK.DwVersion, TK.EOF])
    })

    it('DwVersion token value includes the full %dw 2.0 text', () => {
      const t = lex('%dw 2.0').find((t) => t.kind === TK.DwVersion)!
      expect(t.value).toBe('%dw 2.0')
    })

    it('lexes output as KwOutput', () => {
      expect(kinds('output')).toEqual([TK.KwOutput, TK.EOF])
    })

    it('lexes input as KwInput', () => {
      expect(kinds('input')).toEqual([TK.KwInput, TK.EOF])
    })
  })

  // ─── 8. var declaration ─────────────────────────────────────────────────────

  describe('variable declaration', () => {
    it('lexes "var x = 1" with Whitespace tokens preserved', () => {
      const k = lex('var x = 1')
        .filter((t) => t.kind !== TK.Newline)
        .map((t) => t.kind)
      expect(k).toEqual([
        TK.KwVar,
        TK.Whitespace,
        TK.Ident,
        TK.Whitespace,
        TK.Eq,
        TK.Whitespace,
        TK.Int,
        TK.EOF,
      ])
    })
  })

  // ─── 9. Full script ─────────────────────────────────────────────────────────

  describe('full DataWeave script', () => {
    it('lexes a complete DataWeave header + separator + body without error', () => {
      const src = '%dw 2.0\noutput application/json\n---\n{a: 1}'
      const result = lex(src)
      expect(result).toBeDefined()
      expect(result.length).toBeGreaterThan(0)
      // Last token must be EOF
      expect(result[result.length - 1].kind).toBe(TK.EOF)
    })

    it('full script contains exactly one TripleDash token', () => {
      const src = '%dw 2.0\noutput application/json\n---\n{a: 1}'
      const tripleDashes = lex(src).filter((t) => t.kind === TK.TripleDash)
      expect(tripleDashes).toHaveLength(1)
    })

    it('full script contains DwVersion, KwOutput, TripleDash, LBrace, RBrace', () => {
      const src = '%dw 2.0\noutput application/json\n---\n{a: 1}'
      const k = kinds(src)
      expect(k).toContain(TK.DwVersion)
      expect(k).toContain(TK.KwOutput)
      expect(k).toContain(TK.TripleDash)
      expect(k).toContain(TK.LBrace)
      expect(k).toContain(TK.RBrace)
    })

    it('script with var directive lexes correctly', () => {
      const src = '%dw 2.0\noutput application/json\nvar x = 1\n---\nx'
      const result = lex(src)
      expect(result[result.length - 1].kind).toBe(TK.EOF)
      const k = kinds(src)
      expect(k).toContain(TK.KwVar)
      expect(k).toContain(TK.TripleDash)
    })

    it('script with if-else lexes correctly', () => {
      const src = '%dw 2.0\noutput application/json\n---\nif (true) 1 else 2'
      const k = kinds(src)
      expect(k).toContain(TK.KwIf)
      expect(k).toContain(TK.KwElse)
    })

    it('script with comments preserved', () => {
      const src = '// header comment\n%dw 2.0\noutput application/json\n---\n/* body comment */ {}'
      const k = kinds(src)
      expect(k).toContain(TK.Comment)
      expect(k).toContain(TK.BlockComment)
    })
  })

  // ─── 10. Position tracking ──────────────────────────────────────────────────

  describe('position tracking', () => {
    it('first token starts at line 1 col 1', () => {
      const result = lex('{')
      expect(result[0].line).toBe(1)
      expect(result[0].col).toBe(1)
    })

    it('tracks column correctly for tokens on the same line', () => {
      const result = lex('{}')
      expect(result[0].col).toBe(1) // {
      expect(result[1].col).toBe(2) // }
    })

    it('increments line number after newlines', () => {
      const result = lex('a\nb')
      const aToken = result.find((t) => t.kind === TK.Ident && t.value === 'a')!
      const bToken = result.find((t) => t.kind === TK.Ident && t.value === 'b')!
      expect(aToken.line).toBe(1)
      expect(bToken.line).toBe(2)
    })

    it('col resets to 1 after a newline', () => {
      const result = lex('a\nb')
      const bToken = result.find((t) => t.kind === TK.Ident && t.value === 'b')!
      expect(bToken.col).toBe(1)
    })

    it('EOF token has correct position', () => {
      const result = lex('ab')
      const eof = result[result.length - 1]
      expect(eof.kind).toBe(TK.EOF)
      expect(eof.line).toBe(1)
    })
  })

  // ─── 11. Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty string produces only EOF', () => {
      expect(kinds('')).toEqual([TK.EOF])
    })

    it('whitespace-only string produces Whitespace and EOF', () => {
      const result = lex('   ')
      expect(result[0].kind).toBe(TK.Whitespace)
      expect(result[result.length - 1].kind).toBe(TK.EOF)
    })

    it('number token preserves exact value', () => {
      const t = tokens('42')
      expect(t[0].value).toBe('42')
    })

    it('float token preserves exact value', () => {
      const t = tokens('3.14')
      expect(t[0].value).toBe('3.14')
    })

    it('Newline tokens are produced for \\n', () => {
      const result = lex('a\nb')
      const newlines = result.filter((t) => t.kind === TK.Newline)
      expect(newlines).toHaveLength(1)
    })
  })
})
