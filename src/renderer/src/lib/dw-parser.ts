// DataWeave Parser — Stage 2 of the AST-based formatter pipeline
// Converts Token[] from the lexer into a DWDocument AST.
//
// Design notes:
// - Recursive-descent Pratt parser for correct binary operator precedence.
// - Whitespace and Newline tokens are filtered out before parsing.
// - Comment tokens are collected separately and attached to AST nodes as
//   leadingComments/trailingComments using line-number proximity.
// - On unexpected token, throws ParseError (caller should catch and bail out,
//   returning original source unchanged).

import { TK, Token, lex } from './dw-lexer'
import type {
  DWNode,
  DWDocument,
  DWHeader,
  DWVarDirective,
  DWFunDirective,
  DWTypeDirective,
  DWNsDirective,
  DWImportDirective,
  DWInputDirective,
  DWOutputDirective,
  DWIfExpr,
  DWMatchExpr,
  DWDoExpr,
  DWUsingExpr,
  DWLambda,
  DWBinaryExpr,
  DWUnaryExpr,
  DWSelectorExpr,
  DWFunctionCall,
  DWObjectExpr,
  DWArrayExpr,
  DWEnclosedExpr,
  DWLiteral,
  DWIdentifier,
  DWConditionalExpr,
  DWParam,
  DWObjectEntry,
  DWMatchCase,
} from './dw-ast'

// ─── ParseError ───────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly col?: number,
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

// ─── Binary Operator Precedence Table ────────────────────────────────────────

// Default precedence for any identifier used as an infix function.
// In DataWeave, any two-parameter function can be used infix: `a myFunc b`.
const INFIX_FUNC_PREC = 48

const BINARY_PREC: Record<string, number> = {
  default: 5,
  or: 10,
  and: 20,
  '==': 30,
  '!=': 30,
  '~=': 30,
  '<': 40,
  '<=': 40,
  '>': 40,
  '>=': 40,
  is: 45,
  '++': 50,
  '--': 50,
  '+': 60,
  '-': 60,
  '*': 70,
  '/': 70,
  as: 80,
}

// ─── Parser State ─────────────────────────────────────────────────────────────

interface ParserState {
  tokens: Token[] // filtered (no Whitespace/Newline)
  comments: Token[] // collected Comment/BlockComment tokens
  pos: number
}

function createState(src: string): ParserState {
  const all = lex(src)
  const tokens: Token[] = []
  const comments: Token[] = []

  for (const tok of all) {
    if (tok.kind === TK.Whitespace || tok.kind === TK.Newline) {
      // skip
    } else if (tok.kind === TK.Comment || tok.kind === TK.BlockComment) {
      comments.push(tok)
    } else {
      tokens.push(tok)
    }
  }

  return { tokens, comments, pos: 0 }
}

// ─── Token Stream Helpers ─────────────────────────────────────────────────────

function peek(state: ParserState): Token {
  return state.tokens[state.pos] ?? { kind: TK.EOF, value: '', line: 0, col: 0 }
}

function advance(state: ParserState): Token {
  const tok = state.tokens[state.pos] ?? { kind: TK.EOF, value: '', line: 0, col: 0 }
  if (state.pos < state.tokens.length) state.pos++
  return tok
}

function expect(state: ParserState, kind: TK): Token {
  const tok = peek(state)
  if (tok.kind !== kind) {
    throw new ParseError(
      `Expected token kind ${kind} but got ${tok.kind} ("${tok.value}")`,
      tok.line,
      tok.col,
    )
  }
  return advance(state)
}

function match(state: ParserState, kind: TK): boolean {
  if (peek(state).kind === kind) {
    advance(state)
    return true
  }
  return false
}

function at(state: ParserState, kind: TK): boolean {
  return peek(state).kind === kind
}

// ─── Comment Attachment ───────────────────────────────────────────────────────

/**
 * Collect comment tokens whose line is <= the given line number.
 * Advances commentIndex past the consumed comments.
 */
function collectLeadingComments(
  state: ParserState,
  commentIndex: { value: number },
  toLine: number,
): string[] {
  const result: string[] = []
  while (
    commentIndex.value < state.comments.length &&
    state.comments[commentIndex.value].line <= toLine
  ) {
    result.push(state.comments[commentIndex.value].value)
    commentIndex.value++
  }
  return result
}

/**
 * Collect comment tokens on the same line as endLine (trailing comments).
 */
function collectTrailingComments(
  state: ParserState,
  commentIndex: { value: number },
  endLine: number,
): string[] {
  const result: string[] = []
  while (
    commentIndex.value < state.comments.length &&
    state.comments[commentIndex.value].line === endLine
  ) {
    result.push(state.comments[commentIndex.value].value)
    commentIndex.value++
  }
  return result
}

// ─── Keyword-as-Identifier Helper ─────────────────────────────────────────────

function isKeywordUsedAsIdent(kind: TK): boolean {
  return (
    kind === TK.KwType ||
    kind === TK.KwInput ||
    kind === TK.KwOutput ||
    kind === TK.KwVar ||
    kind === TK.KwFun ||
    kind === TK.KwNs ||
    kind === TK.KwImport ||
    kind === TK.KwDefault ||
    kind === TK.KwUpdate ||
    kind === TK.KwUsing
  )
}

// ─── Header Parsing ───────────────────────────────────────────────────────────

function parseHeader(state: ParserState, commentIdx: { value: number }): DWHeader {
  const directives: DWNode[] = []
  let prevEndLine = -1

  while (!at(state, TK.TripleDash) && !at(state, TK.EOF)) {
    const tok = peek(state)
    const startLine = tok.line
    // Leading comments before directive
    const leading = collectLeadingComments(state, commentIdx, tok.line - 1)
    const directive = parseDirective(state, commentIdx)
    if (directive) {
      // Detect blank line: if this directive starts 2+ lines after the previous ended
      const blankLineBefore = prevEndLine >= 0 && startLine - prevEndLine > 1
      if (leading.length > 0 || blankLineBefore) {
        directives.push({ ...directive, ...(leading.length > 0 ? { leadingComments: leading } : {}), ...(blankLineBefore ? { blankLineBefore: true } : {}) })
      } else {
        directives.push(directive)
      }
      // Track end line: use current token position as approximation
      prevEndLine = state.tokens[state.pos - 1]?.line ?? startLine
    }
  }

  return { kind: 'Header', directives }
}

function parseDirective(state: ParserState, commentIdx: { value: number }): DWNode | null {
  switch (peek(state).kind) {
    case TK.KwVar:
      return parseVarDirective(state, commentIdx)
    case TK.KwFun:
      return parseFunDirective(state, commentIdx)
    case TK.KwType:
      return parseTypeDirective(state)
    case TK.KwNs:
      return parseNsDirective(state)
    case TK.KwImport:
      return parseImportDirective(state)
    case TK.KwInput:
      return parseInputDirective(state)
    case TK.KwOutput:
      return parseOutputDirective(state)
    default:
      advance(state) // skip unexpected tokens
      return null
  }
}

function parseOutputDirective(state: ParserState): DWOutputDirective {
  const startLine = peek(state).line
  expect(state, TK.KwOutput)

  const mimeParts: string[] = []
  const properties: string[] = []

  // Collect MIME type (e.g. "application/json") — first ident / second ident
  if (at(state, TK.Ident) && peek(state).line === startLine) {
    mimeParts.push(advance(state).value)
    if (at(state, TK.Slash) && peek(state).line === startLine) {
      advance(state) // consume /
      if (at(state, TK.Ident) && peek(state).line === startLine) {
        mimeParts.push(advance(state).value)
      }
    }
  }

  const mimeType = mimeParts.length === 2 ? mimeParts.join('/') : mimeParts.join('')

  // Consume rest of line as properties
  while (peek(state).line === startLine && !at(state, TK.EOF) && !at(state, TK.TripleDash)) {
    const propTokens: string[] = []
    while (peek(state).line === startLine && !at(state, TK.EOF) && !at(state, TK.TripleDash)) {
      propTokens.push(advance(state).value)
    }
    if (propTokens.length > 0) properties.push(propTokens.join(''))
    break
  }

  return { kind: 'OutputDirective', mimeType, properties }
}

function parseInputDirective(state: ParserState): DWInputDirective {
  const startLine = peek(state).line
  expect(state, TK.KwInput)

  const nameTok = expect(state, TK.Ident)
  const name = nameTok.value

  const mimeParts: string[] = []
  if (at(state, TK.Ident) && peek(state).line === startLine) {
    mimeParts.push(advance(state).value)
    if (at(state, TK.Slash) && peek(state).line === startLine) {
      advance(state) // consume /
      if (at(state, TK.Ident) && peek(state).line === startLine) {
        mimeParts.push(advance(state).value)
      }
    }
  }

  const mimeType = mimeParts.length === 2 ? mimeParts.join('/') : mimeParts.join('')
  return { kind: 'InputDirective', name, mimeType }
}

function parseVarDirective(
  state: ParserState,
  commentIdx: { value: number },
): DWVarDirective {
  expect(state, TK.KwVar)
  const nameTok = expect(state, TK.Ident)
  const name = nameTok.value

  let typeAnnotation: string | null = null
  if (match(state, TK.Colon)) {
    typeAnnotation = consumeTypeAnnotation(state)
  }

  expect(state, TK.Eq)
  const value = parseExpression(state, 0, commentIdx)

  return { kind: 'VarDirective', name, typeAnnotation, value }
}

function parseFunDirective(
  state: ParserState,
  commentIdx: { value: number },
): DWFunDirective {
  expect(state, TK.KwFun)
  const nameTok = expect(state, TK.Ident)
  const name = nameTok.value

  expect(state, TK.LParen)
  const params = parseFunParams(state)
  expect(state, TK.RParen)

  // Optional return type annotation: ): ReturnType =
  if (match(state, TK.Colon)) {
    consumeTypeAnnotation(state)
  }

  expect(state, TK.Eq)
  const body = parseExpression(state, 0, commentIdx)

  return { kind: 'FunDirective', name, params, body }
}

function parseFunParams(state: ParserState): DWParam[] {
  const params: DWParam[] = []
  while (!at(state, TK.RParen) && !at(state, TK.EOF)) {
    const tok = peek(state)
    if (tok.kind !== TK.Ident) break
    advance(state)
    const paramName = tok.value

    let typeAnnotation: string | null = null
    if (match(state, TK.Colon)) {
      typeAnnotation = consumeTypeAnnotation(state)
    }

    // Optional default value: param = expr
    let defaultValue: string | null = null
    if (match(state, TK.Eq)) {
      // Consume default value tokens until , or ) at depth 0
      const dvParts: string[] = []
      let dvDepth = 0
      while (!at(state, TK.EOF)) {
        const t = peek(state)
        if (t.kind === TK.LParen || t.kind === TK.LBracket || t.kind === TK.LBrace) { dvDepth++; dvParts.push(advance(state).value); continue }
        if (t.kind === TK.RParen || t.kind === TK.RBracket || t.kind === TK.RBrace) {
          if (dvDepth > 0) { dvDepth--; dvParts.push(advance(state).value); continue }
          break
        }
        if (dvDepth === 0 && t.kind === TK.Comma) break
        dvParts.push(advance(state).value)
      }
      defaultValue = dvParts.join('')
    }

    params.push({ kind: 'Param', name: paramName, typeAnnotation, defaultValue })
    if (!match(state, TK.Comma)) break
  }
  return params
}

function parseTypeDirective(state: ParserState): DWTypeDirective {
  expect(state, TK.KwType)
  const nameTok = expect(state, TK.Ident)
  const name = nameTok.value
  expect(state, TK.Eq)

  const startLine = nameTok.line
  const parts: string[] = []
  let depth = 0

  while (!at(state, TK.EOF) && !at(state, TK.TripleDash)) {
    const t = peek(state)
    if (depth === 0 && t.line > startLine + 2) break
    if (t.kind === TK.LBrace || t.kind === TK.LBracket || t.kind === TK.LParen) depth++
    if (t.kind === TK.RBrace || t.kind === TK.RBracket || t.kind === TK.RParen) {
      if (depth === 0) break
      depth--
    }
    if (
      depth === 0 &&
      (t.kind === TK.KwVar ||
        t.kind === TK.KwFun ||
        t.kind === TK.KwType ||
        t.kind === TK.KwNs ||
        t.kind === TK.KwImport ||
        t.kind === TK.KwInput ||
        t.kind === TK.KwOutput)
    ) {
      break
    }
    parts.push(advance(state).value)
  }

  return { kind: 'TypeDirective', name, value: parts.join(' ') }
}

function parseNsDirective(state: ParserState): DWNsDirective {
  expect(state, TK.KwNs)
  const prefixTok = expect(state, TK.Ident)
  const prefix = prefixTok.value
  const uriTok = peek(state)
  let uri = ''
  if (uriTok.kind === TK.StringLit || uriTok.kind === TK.Ident) {
    uri = advance(state).value
  }
  return { kind: 'NsDirective', prefix, uri }
}

function parseImportDirective(state: ParserState): DWImportDirective {
  expect(state, TK.KwImport)
  const startLine = peek(state).line
  const parts: string[] = []

  while (!at(state, TK.EOF) && !at(state, TK.TripleDash)) {
    const t = peek(state)
    if (
      t.kind === TK.KwVar ||
      t.kind === TK.KwFun ||
      t.kind === TK.KwType ||
      t.kind === TK.KwNs ||
      t.kind === TK.KwImport ||
      t.kind === TK.KwInput ||
      t.kind === TK.KwOutput
    ) {
      break
    }
    if (t.line > startLine + 1) break
    const val = advance(state).value
    // Don't add space before/after colons (for :: namespace separator)
    if (val === ':' || (parts.length > 0 && parts[parts.length - 1] === ':')) {
      parts.push(val)
    } else {
      if (parts.length > 0) parts.push(' ')
      parts.push(val)
    }
  }

  return { kind: 'ImportDirective', raw: parts.join('') }
}

// ─── Type Annotation Consumption ─────────────────────────────────────────────

function consumeTypeAnnotation(state: ParserState): string {
  const parts: string[] = []
  let depth = 0

  while (!at(state, TK.EOF)) {
    const t = peek(state)
    if (t.kind === TK.Lt || t.kind === TK.LBracket || t.kind === TK.LParen) {
      depth++
      parts.push(advance(state).value)
      continue
    }
    if (t.kind === TK.Gt || t.kind === TK.RBracket || t.kind === TK.RParen) {
      if (depth > 0) {
        depth--
        parts.push(advance(state).value)
        continue
      }
      break
    }
    if (depth === 0) {
      if (
        t.kind === TK.Eq ||
        t.kind === TK.Comma ||
        t.kind === TK.RBrace
      )
        break
    }
    parts.push(advance(state).value)
  }

  return parts.join('')
}

// ─── Expression Parsing (Pratt) ───────────────────────────────────────────────

function getPrec(tok: Token): number {
  if (tok.kind === TK.KwAs) return BINARY_PREC['as'] ?? -1
  if (tok.kind === TK.KwIs) return BINARY_PREC['is'] ?? -1
  if (tok.kind === TK.KwAnd) return BINARY_PREC['and'] ?? -1
  if (tok.kind === TK.KwOr) return BINARY_PREC['or'] ?? -1
  if (tok.kind === TK.KwDefault) return BINARY_PREC['default'] ?? -1
  if (tok.kind === TK.KwUpdate) return INFIX_FUNC_PREC
  const explicit = BINARY_PREC[tok.value]
  if (explicit !== undefined) return explicit
  // Any identifier in infix position is a user-defined or built-in infix function
  if (tok.kind === TK.Ident) return INFIX_FUNC_PREC
  return -1
}

function getOpValue(tok: Token): string {
  if (tok.kind === TK.KwAs) return 'as'
  if (tok.kind === TK.KwIs) return 'is'
  if (tok.kind === TK.KwAnd) return 'and'
  if (tok.kind === TK.KwOr) return 'or'
  if (tok.kind === TK.KwDefault) return 'default'
  return tok.value
}

function parseExpression(
  state: ParserState,
  minPrec: number,
  commentIdx: { value: number },
): DWNode {
  let left = parsePrimary(state, commentIdx)

  // (expr): value — dynamic-key single-entry object (implicit object without braces)
  if (left.kind === 'EnclosedExpr' && at(state, TK.Colon)) {
    advance(state) // consume :
    const value = parseExpression(state, 0, commentIdx)
    const entry: DWObjectEntry = { kind: 'ObjectEntry', key: (left as DWEnclosedExpr).expr, value, conditional: null, dynamic: true }
    left = { kind: 'ObjectExpr', entries: [entry] } as DWObjectExpr
  }

  while (true) {
    const op = peek(state)

    // `match` is a postfix/infix keyword operator
    if (op.kind === TK.KwMatch) {
      advance(state)
      left = parseMatchBody(state, left, commentIdx)
      continue
    }

    // `using` can appear as a postfix operator: `expr using (bindings)`
    if (op.kind === TK.KwUsing && minPrec === 0) {
      advance(state)
      expect(state, TK.LParen)
      const bindings: { name: string; value: DWNode }[] = []
      while (!at(state, TK.RParen) && !at(state, TK.EOF)) {
        const nameTok = expect(state, TK.Ident)
        expect(state, TK.Eq)
        const value = parseExpression(state, 0, commentIdx)
        bindings.push({ name: nameTok.value, value })
        if (!match(state, TK.Comma)) break
      }
      expect(state, TK.RParen)
      left = { kind: 'UsingExpr', bindings, body: left } as DWUsingExpr
      continue
    }

    const prec = getPrec(op)
    if (prec <= minPrec) break

    advance(state)
    const opVal = getOpValue(op)
    let right = parseExpression(state, prec, commentIdx) // left-associative

    // `as Type {format: "0"}` — consume optional format object after `as`
    if (opVal === 'as' && at(state, TK.LBrace)) {
      // Consume {key: value, ...} as raw text appended to the type name
      const fmtParts: string[] = []
      let fmtDepth = 0
      fmtParts.push(advance(state).value) // consume {
      fmtDepth++
      while (!at(state, TK.EOF) && fmtDepth > 0) {
        const t = peek(state)
        if (t.kind === TK.LBrace) fmtDepth++
        else if (t.kind === TK.RBrace) fmtDepth--
        fmtParts.push(advance(state).value)
        // Add space after : and ,
        if ((t.kind === TK.Colon || t.kind === TK.Comma) && fmtDepth > 0) fmtParts.push(' ')
      }
      const fmtStr = ' ' + fmtParts.join('')
      // Append format to the right-side identifier/type
      if (right.kind === 'Identifier') {
        right = { ...right, name: (right as DWIdentifier).name + fmtStr } as DWIdentifier
      }
    }

    left = { kind: 'BinaryExpr', op: opVal, left, right } as DWBinaryExpr
  }

  // Postfix `if (condition)` — ConditionalExpr: `value if (cond)`
  // Only at top-level expressions (minPrec === 0) to avoid consuming `if` that
  // belongs to an if-expression in an enclosing context
  if (at(state, TK.KwIf) && minPrec === 0) {
    advance(state) // consume `if`
    let condition: DWNode
    if (at(state, TK.LParen)) {
      advance(state) // consume (
      condition = parseExpression(state, 0, commentIdx)
      expect(state, TK.RParen)
    } else {
      condition = parsePrimary(state, commentIdx)
    }
    left = { kind: 'ConditionalExpr', expr: left, condition } as DWConditionalExpr
  }

  return left
}

// ─── Primary Expression Parsing ───────────────────────────────────────────────

function parsePrimary(state: ParserState, commentIdx: { value: number }): DWNode {
  const tok = peek(state)

  // Collect leading comments before this token
  const leading = collectLeadingComments(state, commentIdx, tok.line - 1)

  let node: DWNode

  switch (tok.kind) {
    case TK.Int:
    case TK.Float: {
      advance(state)
      node = { kind: 'Literal', value: tok.value, literalType: 'number' } as DWLiteral
      break
    }

    case TK.StringLit: {
      advance(state)
      node = { kind: 'Literal', value: tok.value, literalType: 'string' } as DWLiteral
      break
    }

    case TK.Bool:
    case TK.KwTrue:
    case TK.KwFalse: {
      advance(state)
      node = { kind: 'Literal', value: tok.value, literalType: 'boolean' } as DWLiteral
      break
    }

    case TK.Null:
    case TK.KwNull: {
      advance(state)
      node = { kind: 'Literal', value: 'null', literalType: 'null' } as DWLiteral
      break
    }

    case TK.Ident: {
      advance(state)
      node = { kind: 'Identifier', name: tok.value } as DWIdentifier
      break
    }

    case TK.LBrace: {
      node = parseObject(state, commentIdx)
      break
    }

    case TK.LBracket: {
      node = parseArray(state, commentIdx)
      break
    }

    case TK.LParen: {
      node = parseParenOrLambda(state, commentIdx)
      break
    }

    case TK.KwIf: {
      node = parseIfExpr(state, commentIdx)
      break
    }

    case TK.KwDo: {
      node = parseDoExpr(state, commentIdx)
      break
    }

    case TK.KwUsing: {
      node = parseUsingExpr(state, commentIdx)
      break
    }

    case TK.Minus: {
      advance(state)
      const operand = parsePrimary(state, commentIdx)
      node = { kind: 'UnaryExpr', op: '-', operand } as DWUnaryExpr
      break
    }

    case TK.Bang: {
      advance(state)
      const operand = parsePrimary(state, commentIdx)
      node = { kind: 'UnaryExpr', op: '!', operand } as DWUnaryExpr
      break
    }

    case TK.KwNot: {
      advance(state)
      const operand = parsePrimary(state, commentIdx)
      node = { kind: 'UnaryExpr', op: 'not', operand } as DWUnaryExpr
      break
    }

    case TK.Star: {
      // Standalone wildcard
      advance(state)
      node = { kind: 'Identifier', name: '*' } as DWIdentifier
      break
    }

    default: {
      throw new ParseError(
        `Unexpected token: "${tok.value}" (kind ${tok.kind})`,
        tok.line,
        tok.col,
      )
    }
  }

  // Attach leading comments
  if (leading.length > 0) {
    node = { ...node, leadingComments: leading }
  }

  // Parse postfix selectors: .ident, ..ident, [expr], (args), ?, !
  node = parsePostfix(state, node, commentIdx)

  return node
}

// ─── Postfix Selectors ────────────────────────────────────────────────────────

function parsePostfix(state: ParserState, node: DWNode, commentIdx: { value: number }): DWNode {
  while (true) {
    const tok = peek(state)

    if (tok.kind === TK.Dot) {
      advance(state)
      // .*ident — multi-value selector (get all values with key 'ident')
      if (at(state, TK.Star)) {
        advance(state)
        const sel = peek(state)
        if (sel.kind === TK.Ident || isKeywordUsedAsIdent(sel.kind)) {
          advance(state)
          node = {
            kind: 'SelectorExpr',
            expr: node,
            selector: '*' + sel.value,
            selectorKind: 'dot',
          } as DWSelectorExpr
          continue
        }
        // .* without ident — wildcard
        node = {
          kind: 'SelectorExpr',
          expr: node,
          selector: '*',
          selectorKind: 'dot',
        } as DWSelectorExpr
        continue
      }
      // .ident, .keyword-as-ident, or ."string" (quoted selector)
      const sel = peek(state)
      if (sel.kind === TK.Ident || isKeywordUsedAsIdent(sel.kind)) {
        advance(state)
        node = {
          kind: 'SelectorExpr',
          expr: node,
          selector: sel.value,
          selectorKind: 'dot',
        } as DWSelectorExpr
        continue
      }
      if (sel.kind === TK.StringLit) {
        advance(state)
        node = {
          kind: 'SelectorExpr',
          expr: node,
          selector: sel.value,
          selectorKind: 'dot',
        } as DWSelectorExpr
        continue
      }
      break
    }

    if (tok.kind === TK.DotDot) {
      advance(state)
      const sel = peek(state)
      if (sel.kind === TK.Star) {
        // ..*ident — descendant wildcard selector
        advance(state)
        const ident = peek(state)
        if (ident.kind === TK.Ident || isKeywordUsedAsIdent(ident.kind)) {
          advance(state)
          node = {
            kind: 'SelectorExpr',
            expr: node,
            selector: '*' + ident.value,
            selectorKind: 'dotdot',
          } as DWSelectorExpr
          continue
        }
        // ..* without ident
        node = {
          kind: 'SelectorExpr',
          expr: node,
          selector: '*',
          selectorKind: 'dotdot',
        } as DWSelectorExpr
        continue
      }
      if (sel.kind === TK.Ident || isKeywordUsedAsIdent(sel.kind)) {
        advance(state)
        node = {
          kind: 'SelectorExpr',
          expr: node,
          selector: sel.value,
          selectorKind: 'dotdot',
        } as DWSelectorExpr
        continue
      }
      break
    }

    if (tok.kind === TK.LBracket) {
      advance(state)
      if (at(state, TK.RBracket)) {
        // Empty bracket: expr[]
        advance(state)
        node = {
          kind: 'SelectorExpr',
          expr: node,
          selector: '',
          selectorKind: 'bracket',
        } as DWSelectorExpr
      } else {
        const indexExpr = parseExpression(state, 0, commentIdx)
        expect(state, TK.RBracket)
        node = {
          kind: 'SelectorExpr',
          expr: node,
          selector: '',
          selectorKind: 'bracket',
          indexExpr,
        } as DWSelectorExpr
      }
      continue
    }

    if (tok.kind === TK.LParen) {
      // Function call: expr(args)
      advance(state)
      const args = parseArgList(state, commentIdx)
      expect(state, TK.RParen)
      node = { kind: 'FunctionCall', callee: node, args } as DWFunctionCall
      continue
    }

    if (tok.kind === TK.Question) {
      advance(state)
      node = {
        kind: 'SelectorExpr',
        expr: node,
        selector: '?',
        selectorKind: 'filter',
      } as DWSelectorExpr
      continue
    }

    if (tok.kind === TK.Bang) {
      advance(state)
      node = {
        kind: 'SelectorExpr',
        expr: node,
        selector: '!',
        selectorKind: 'metadata',
      } as DWSelectorExpr
      continue
    }

    break
  }

  return node
}

// ─── Object Parsing ───────────────────────────────────────────────────────────

function parseObject(state: ParserState, commentIdx: { value: number }): DWObjectExpr {
  expect(state, TK.LBrace)
  const entries: DWObjectEntry[] = []

  while (!at(state, TK.RBrace) && !at(state, TK.EOF)) {
    if (at(state, TK.Comma)) {
      advance(state)
      continue
    }
    const entry = parseObjectEntry(state, commentIdx)
    if (entry) {
      entries.push(entry)
      match(state, TK.Comma) // optional trailing comma
    }
  }

  expect(state, TK.RBrace)
  return { kind: 'ObjectExpr', entries }
}

function parseObjectEntry(
  state: ParserState,
  commentIdx: { value: number },
): DWObjectEntry | null {
  // Collect leading comments that appear before this entry
  const entryLeading = collectLeadingComments(state, commentIdx, peek(state).line)

  let dynamic = false
  let key: DWNode

  if (at(state, TK.LParen)) {
    // Could be:
    // 1. Dynamic key: (expr): value
    // 2. Conditional entry: (key: value) if(cond) — whole key:value wrapped in parens
    // 3. Conditional entry with expression body: (expr) if(cond) — spreads/null
    // Look ahead to distinguish: if we see `ident :` before `)`, it's a conditional entry.
    const saved = state.pos
    advance(state) // consume (
    if ((at(state, TK.Ident) || at(state, TK.StringLit) || isKeywordUsedAsIdent(peek(state).kind)) && state.pos + 1 < state.tokens.length && state.tokens[state.pos + 1].kind === TK.Colon) {
      // Conditional entry: (key: value) if(cond)
      const innerEntry = parseObjectEntry(state, commentIdx)
      expect(state, TK.RParen)
      // Check for trailing if(cond)
      let conditional: DWNode | null = null
      if (at(state, TK.KwIf)) {
        advance(state)
        if (at(state, TK.LParen)) {
          advance(state)
          conditional = parseExpression(state, 0, commentIdx)
          expect(state, TK.RParen)
        } else {
          conditional = parseExpression(state, 0, commentIdx)
        }
      }
      if (innerEntry) {
        innerEntry.conditional = conditional
        if (entryLeading.length > 0) {
          innerEntry.leadingComments = [...entryLeading, ...(innerEntry.leadingComments ?? [])]
        }
      }
      return innerEntry
    }
    // Not ident:value — could be:
    // (if(cond) key: val else null) — conditional spread
    // (expr): value — dynamic key
    // (expr) if(cond) — conditional spread expression
    state.pos = saved
    advance(state) // consume (

    if (at(state, TK.KwIf)) {
      // Conditional spread: (if(cond) key: val else null)
      // Parse as raw tokens until matching ) — only track parens
      // Join tokens without adding spaces around dots, before/after parens, around brackets
      const startPos = state.pos
      let parenDepth = 1
      while (!at(state, TK.EOF) && parenDepth > 0) {
        if (at(state, TK.LParen)) parenDepth++
        else if (at(state, TK.RParen)) {
          parenDepth--
          if (parenDepth === 0) break
        }
        advance(state)
      }
      const rawTokens = state.tokens.slice(startPos, state.pos)
      // Smart join: no space around . , before (, after (, before ), before [, after ], before ,
      const noSpaceBefore = new Set([TK.Dot, TK.DotDot, TK.LParen, TK.RParen, TK.LBracket, TK.RBracket, TK.Comma, TK.Colon])
      const noSpaceAfter = new Set([TK.Dot, TK.DotDot, TK.LParen, TK.LBracket, TK.Bang])
      let rawStr = ''
      for (let ti = 0; ti < rawTokens.length; ti++) {
        const tok = rawTokens[ti]
        if (ti > 0 && !noSpaceBefore.has(tok.kind) && !noSpaceAfter.has(rawTokens[ti - 1].kind)) {
          rawStr += ' '
        }
        rawStr += tok.value
      }
      expect(state, TK.RParen) // consume )
      const spreadExpr: DWIdentifier = { kind: 'Identifier', name: rawStr }
      return { kind: 'ObjectEntry', key: spreadExpr, value: { kind: 'Literal', value: 'null', literalType: 'null' } as DWLiteral, conditional: null, dynamic: false, spread: true, ...(entryLeading.length > 0 ? { leadingComments: entryLeading } : {}) } as DWObjectEntry
    }

    const innerExpr = parseExpression(state, 0, commentIdx)
    expect(state, TK.RParen)
    if (at(state, TK.Colon)) {
      // Dynamic key: (expr): value
      dynamic = true
      key = innerExpr
    } else {
      // Spread expression: (expr) if(cond)
      let conditional: DWNode | null = null
      if (at(state, TK.KwIf)) {
        advance(state)
        if (at(state, TK.LParen)) {
          advance(state)
          conditional = parseExpression(state, 0, commentIdx)
          expect(state, TK.RParen)
        } else {
          conditional = parseExpression(state, 0, commentIdx)
        }
      }
      return { kind: 'ObjectEntry', key: innerExpr, value: { kind: 'Literal', value: 'null', literalType: 'null' } as DWLiteral, conditional, dynamic: false, spread: true, ...(entryLeading.length > 0 ? { leadingComments: entryLeading } : {}) } as DWObjectEntry
    }
  } else if (at(state, TK.StringLit)) {
    key = { kind: 'Literal', value: advance(state).value, literalType: 'string' } as DWLiteral
  } else if (at(state, TK.Ident) || isKeywordUsedAsIdent(peek(state).kind)) {
    const nameTok = advance(state)
    key = { kind: 'Identifier', name: nameTok.value } as DWIdentifier
  } else if (at(state, TK.At)) {
    // XML attribute: @key: value
    advance(state)
    const nameTok = peek(state)
    if (nameTok.kind === TK.Ident || isKeywordUsedAsIdent(nameTok.kind)) {
      advance(state)
      key = { kind: 'Identifier', name: '@' + nameTok.value } as DWIdentifier
    } else {
      key = { kind: 'Identifier', name: '@' } as DWIdentifier
    }
  } else {
    return null
  }

  expect(state, TK.Colon)
  const value = parseExpression(state, 0, commentIdx)

  // Optional inline conditional: entry if (cond)
  let conditional: DWNode | null = null
  if (at(state, TK.KwIf)) {
    advance(state)
    if (at(state, TK.LParen)) {
      advance(state)
      conditional = parseExpression(state, 0, commentIdx)
      expect(state, TK.RParen)
    } else {
      conditional = parseExpression(state, 0, commentIdx)
    }
  }

  const entry: DWObjectEntry = { kind: 'ObjectEntry', key, value, conditional, dynamic }
  if (entryLeading.length > 0) {
    entry.leadingComments = entryLeading
  }
  return entry
}

// ─── Array Parsing ────────────────────────────────────────────────────────────

function parseArray(state: ParserState, commentIdx: { value: number }): DWArrayExpr {
  expect(state, TK.LBracket)
  const elements: DWNode[] = []

  while (!at(state, TK.RBracket) && !at(state, TK.EOF)) {
    elements.push(parseExpression(state, 0, commentIdx))
    if (!match(state, TK.Comma)) break
  }

  expect(state, TK.RBracket)
  return { kind: 'ArrayExpr', elements }
}

// ─── Paren / Lambda ───────────────────────────────────────────────────────────

function parseParenOrLambda(state: ParserState, commentIdx: { value: number }): DWNode {
  expect(state, TK.LParen)

  // Empty parens + arrow: () -> body
  if (at(state, TK.RParen)) {
    advance(state)
    if (at(state, TK.Arrow)) {
      advance(state)
      const body = parseExpression(state, 0, commentIdx)
      return { kind: 'Lambda', params: [], body } as DWLambda
    }
    // Empty parens with no arrow (unusual but valid in some contexts)
    return { kind: 'ObjectExpr', entries: [] } as DWObjectExpr
  }

  // Lookahead: is this a lambda?
  if (isLambdaLookahead(state)) {
    const params = parseLambdaParams(state)
    expect(state, TK.RParen)
    expect(state, TK.Arrow)
    const body = parseExpression(state, 0, commentIdx)
    return { kind: 'Lambda', params, body } as DWLambda
  }

  // Parenthesised expression
  const expr = parseExpression(state, 0, commentIdx)
  expect(state, TK.RParen)

  // Single-param lambda: (x) -> body — expr is Identifier
  if (at(state, TK.Arrow)) {
    advance(state)
    const body = parseExpression(state, 0, commentIdx)
    if (expr.kind === 'Identifier') {
      const param: DWParam = { kind: 'Param', name: expr.name, typeAnnotation: null }
      return { kind: 'Lambda', params: [param], body } as DWLambda
    }
    // Fall through — shouldn't happen in valid DW
    return { kind: 'EnclosedExpr', expr } as DWEnclosedExpr
  }

  return { kind: 'EnclosedExpr', expr } as DWEnclosedExpr
}

/**
 * Lookahead to determine if the paren we're inside is a lambda param list.
 * Scans forward until the matching `)` and checks if next token is `->`.
 */
function isLambdaLookahead(state: ParserState): boolean {
  let i = state.pos
  let depth = 0

  while (i < state.tokens.length) {
    const t = state.tokens[i]
    if (t.kind === TK.LParen || t.kind === TK.LBrace || t.kind === TK.LBracket) {
      depth++
    } else if (t.kind === TK.RParen || t.kind === TK.RBrace || t.kind === TK.RBracket) {
      if (depth === 0) {
        const next = state.tokens[i + 1]
        return next !== undefined && next.kind === TK.Arrow
      }
      depth--
    }
    i++
  }
  return false
}

function parseLambdaParams(state: ParserState): DWParam[] {
  const params: DWParam[] = []
  while (!at(state, TK.RParen) && !at(state, TK.EOF)) {
    const tok = peek(state)
    if (tok.kind !== TK.Ident) break
    advance(state)
    const name = tok.value

    let typeAnnotation: string | null = null
    if (match(state, TK.Colon)) {
      typeAnnotation = consumeTypeAnnotation(state)
    }

    // Optional default value: `acc = 0`
    let defaultValue: string | null = null
    if (match(state, TK.Eq)) {
      // Consume default value tokens until , or )
      const start = state.pos
      let depth = 0
      while (!at(state, TK.EOF)) {
        if (at(state, TK.LParen) || at(state, TK.LBracket) || at(state, TK.LBrace)) depth++
        else if (at(state, TK.RParen) || at(state, TK.RBracket) || at(state, TK.RBrace)) {
          if (depth === 0) break
          depth--
        } else if (at(state, TK.Comma) && depth === 0) break
        advance(state)
      }
      defaultValue = state.tokens.slice(start, state.pos).map(t => t.value).join('')
    }

    params.push({ kind: 'Param', name, typeAnnotation, defaultValue } as DWParam)
    if (!match(state, TK.Comma)) break
  }
  return params
}

// ─── If Expression ────────────────────────────────────────────────────────────

function parseIfExpr(state: ParserState, commentIdx: { value: number }): DWIfExpr {
  expect(state, TK.KwIf)
  expect(state, TK.LParen)
  const cond = parseExpression(state, 0, commentIdx)
  expect(state, TK.RParen)
  const then = parseExpression(state, 0, commentIdx)

  let else_: DWNode | null = null
  if (match(state, TK.KwElse)) {
    else_ = parseExpression(state, 0, commentIdx)
  }

  return { kind: 'IfExpr', cond, then, else_ }
}

// ─── Match Expression ─────────────────────────────────────────────────────────

function parseMatchBody(
  state: ParserState,
  expr: DWNode,
  commentIdx: { value: number },
): DWMatchExpr {
  expect(state, TK.LBrace)
  const cases: DWMatchCase[] = []

  while (!at(state, TK.RBrace) && !at(state, TK.EOF)) {
    const matchCase = parseMatchCase(state, commentIdx)
    if (matchCase) cases.push(matchCase)
  }

  expect(state, TK.RBrace)
  return { kind: 'MatchExpr', expr, cases }
}

function parseMatchCase(
  state: ParserState,
  commentIdx: { value: number },
): DWMatchCase | null {
  if (at(state, TK.KwDefault)) {
    advance(state)
    expect(state, TK.Arrow)
    const body = parseExpression(state, 0, commentIdx)
    const pattern: DWIdentifier = { kind: 'Identifier', name: 'default' }
    return { kind: 'MatchCase', pattern, guard: null, body }
  }

  if (at(state, TK.KwElse)) {
    advance(state)
    expect(state, TK.Arrow)
    const body = parseExpression(state, 0, commentIdx)
    const pattern: DWIdentifier = { kind: 'Identifier', name: 'else' }
    return { kind: 'MatchCase', pattern, guard: null, body }
  }

  if (!at(state, TK.KwCase)) return null
  expect(state, TK.KwCase)

  // `case else ->` — default/else pattern after case keyword
  if (at(state, TK.KwElse)) {
    advance(state)
    expect(state, TK.Arrow)
    const body = parseExpression(state, 0, commentIdx)
    const pattern: DWIdentifier = { kind: 'Identifier', name: 'else' }
    return { kind: 'MatchCase', pattern, guard: null, body }
  }

  let pattern: DWNode
  // `case is TypeName` — type-check pattern
  if (at(state, TK.KwIs)) {
    advance(state)
    const typeTok = expect(state, TK.Ident)
    pattern = { kind: 'Identifier', name: `is ${typeTok.value}` } as DWIdentifier
  } else {
    pattern = parseExpression(state, 0, commentIdx)
  }

  let guard: DWNode | null = null
  if (at(state, TK.KwIf)) {
    advance(state)
    if (at(state, TK.LParen)) {
      advance(state)
      guard = parseExpression(state, 0, commentIdx)
      expect(state, TK.RParen)
    } else {
      guard = parseExpression(state, 0, commentIdx)
    }
  }

  expect(state, TK.Arrow)
  const body = parseExpression(state, 0, commentIdx)

  return { kind: 'MatchCase', pattern, guard, body }
}

// ─── Do Expression ────────────────────────────────────────────────────────────

function parseDoExpr(state: ParserState, commentIdx: { value: number }): DWDoExpr {
  expect(state, TK.KwDo)
  const directives: DWNode[] = []

  if (at(state, TK.LBrace)) {
    advance(state)

    let prevEndLine = -1
    while (!at(state, TK.RBrace) && !at(state, TK.EOF)) {
      if (
        at(state, TK.KwVar) ||
        at(state, TK.KwFun) ||
        at(state, TK.KwType) ||
        at(state, TK.KwNs) ||
        at(state, TK.KwImport)
      ) {
        const tok = peek(state)
        const startLine = tok.line
        const leading = collectLeadingComments(state, commentIdx, tok.line - 1)
        const d = parseDirective(state, commentIdx)
        if (d) {
          const blankLineBefore = prevEndLine >= 0 && startLine - prevEndLine > 1
          if (leading.length > 0 || blankLineBefore) {
            directives.push({ ...d, ...(leading.length > 0 ? { leadingComments: leading } : {}), ...(blankLineBefore ? { blankLineBefore: true } : {}) })
          } else {
            directives.push(d)
          }
          prevEndLine = state.tokens[state.pos - 1]?.line ?? startLine
        }
        match(state, TK.Semicolon)
      } else {
        break
      }
    }

    const header: DWHeader = { kind: 'Header', directives }
    // Consume optional --- separator inside do block
    if (at(state, TK.TripleDash)) advance(state)
    const body = parseImplicitObjectOrExpression(state, commentIdx)
    expect(state, TK.RBrace)
    return { kind: 'DoExpr', header, body }
  }

  const header: DWHeader = { kind: 'Header', directives: [] }
  const body = parseExpression(state, 0, commentIdx)
  return { kind: 'DoExpr', header, body }
}

/**
 * Parse an expression that may be an implicit single-entry object (key: value without braces).
 * Used for do-block bodies and document bodies where `"row": {...}` or `key: value` is valid.
 */
function parseImplicitObjectOrExpression(state: ParserState, commentIdx: { value: number }): DWNode {
  // "string": value — implicit object with string key
  if (at(state, TK.StringLit) && state.pos + 1 < state.tokens.length && state.tokens[state.pos + 1].kind === TK.Colon) {
    const keyTok = advance(state)
    const key: DWLiteral = { kind: 'Literal', value: keyTok.value, literalType: 'string' }
    expect(state, TK.Colon)
    const value = parseExpression(state, 0, commentIdx)
    const entry: DWObjectEntry = { kind: 'ObjectEntry', key, value, conditional: null, dynamic: false }
    return { kind: 'ObjectExpr', entries: [entry] } as DWObjectExpr
  }
  // ident: value — implicit object with ident key (but NOT ident:: namespace)
  if ((at(state, TK.Ident) || isKeywordUsedAsIdent(peek(state).kind)) &&
      state.pos + 1 < state.tokens.length &&
      state.tokens[state.pos + 1].kind === TK.Colon &&
      !(state.pos + 2 < state.tokens.length && state.tokens[state.pos + 2].kind === TK.Colon)) {
    const keyTok = advance(state)
    const key: DWIdentifier = { kind: 'Identifier', name: keyTok.value }
    expect(state, TK.Colon)
    const value = parseExpression(state, 0, commentIdx)
    const entry: DWObjectEntry = { kind: 'ObjectEntry', key, value, conditional: null, dynamic: false }
    return { kind: 'ObjectExpr', entries: [entry] } as DWObjectExpr
  }
  return parseExpression(state, 0, commentIdx)
}

// ─── Using Expression ─────────────────────────────────────────────────────────

function parseUsingExpr(state: ParserState, commentIdx: { value: number }): DWUsingExpr {
  expect(state, TK.KwUsing)
  expect(state, TK.LParen)

  const bindings: { name: string; value: DWNode }[] = []

  while (!at(state, TK.RParen) && !at(state, TK.EOF)) {
    const nameTok = expect(state, TK.Ident)
    expect(state, TK.Eq)
    const value = parseExpression(state, 0, commentIdx)
    bindings.push({ name: nameTok.value, value })
    if (!match(state, TK.Comma)) break
  }

  expect(state, TK.RParen)
  const body = parseExpression(state, 0, commentIdx)

  return { kind: 'UsingExpr', bindings, body }
}

// ─── Argument List ────────────────────────────────────────────────────────────

function parseArgList(state: ParserState, commentIdx: { value: number }): DWNode[] {
  const args: DWNode[] = []
  while (!at(state, TK.RParen) && !at(state, TK.EOF)) {
    args.push(parseExpression(state, 0, commentIdx))
    if (!match(state, TK.Comma)) break
  }
  return args
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parse(src: string): DWDocument {
  const state = createState(src)
  const commentIdx = { value: 0 }

  let header: DWHeader | null = null
  let separator = false

  if (at(state, TK.DwVersion)) {
    advance(state) // consume %dw 2.0
    header = parseHeader(state, commentIdx)

    if (at(state, TK.TripleDash)) {
      advance(state)
      separator = true
    }
  } else if (at(state, TK.TripleDash)) {
    advance(state)
    separator = true
  }

  let body: DWNode
  if (at(state, TK.EOF)) {
    body = { kind: 'ObjectExpr', entries: [] } as DWObjectExpr
  } else {
    body = parseExpression(state, 0, commentIdx)
  }

  return { kind: 'Document', header, separator, body }
}
