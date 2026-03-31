import { describe, it, expect } from 'vitest'
import { parse, ParseError } from '../dw-parser'
import type {
  DWDocument,
  DWHeader,
  DWBinaryExpr,
  DWLiteral,
  DWIdentifier,
  DWObjectExpr,
  DWArrayExpr,
  DWIfExpr,
  DWLambda,
  DWSelectorExpr,
  DWFunctionCall,
  DWVarDirective,
  DWFunDirective,
  DWOutputDirective,
  DWConditionalExpr,
  DWUnaryExpr,
  DWEnclosedExpr,
} from '../dw-ast'

// ─── 1. Document Structure ────────────────────────────────────────────────────

describe('Document structure', () => {
  it('parses a full script with header and body', () => {
    const doc = parse('%dw 2.0\noutput application/json\n---\n{}')
    expect(doc.kind).toBe('Document')
    expect(doc.header).not.toBeNull()
    expect(doc.separator).toBe(true)
    expect(doc.body.kind).toBe('ObjectExpr')
  })

  it('parses a body-only script (no header)', () => {
    const doc = parse('42')
    expect(doc.kind).toBe('Document')
    expect(doc.header).toBeNull()
    expect(doc.separator).toBe(false)
    expect(doc.body.kind).toBe('Literal')
  })

  it('parses script with --- separator but no directives', () => {
    const doc = parse('%dw 2.0\n---\n"hello"')
    expect(doc.separator).toBe(true)
    expect(doc.body.kind).toBe('Literal')
    if (doc.body.kind === 'Literal') {
      expect(doc.body.literalType).toBe('string')
    }
  })

  it('header has OutputDirective with correct mimeType', () => {
    const doc = parse('%dw 2.0\noutput application/json\n---\n{}')
    expect(doc.header).not.toBeNull()
    const header = doc.header as DWHeader
    expect(header.directives.length).toBe(1)
    const out = header.directives[0] as DWOutputDirective
    expect(out.kind).toBe('OutputDirective')
    expect(out.mimeType).toBe('application/json')
  })

  it('body is empty ObjectExpr for empty body', () => {
    const doc = parse('%dw 2.0\n---\n')
    expect(doc.body.kind).toBe('ObjectExpr')
    if (doc.body.kind === 'ObjectExpr') {
      expect(doc.body.entries.length).toBe(0)
    }
  })
})

// ─── 2. Header Directives ─────────────────────────────────────────────────────

describe('Header directives', () => {
  it('parses var directive with integer value', () => {
    const doc = parse('%dw 2.0\nvar x = 1\n---\nx')
    const header = doc.header as DWHeader
    expect(header.directives.length).toBe(1)
    const varDir = header.directives[0] as DWVarDirective
    expect(varDir.kind).toBe('VarDirective')
    expect(varDir.name).toBe('x')
    expect(varDir.value.kind).toBe('Literal')
    if (varDir.value.kind === 'Literal') {
      expect(varDir.value.value).toBe('1')
    }
  })

  it('parses fun directive', () => {
    const doc = parse('%dw 2.0\nfun add(a, b) = a + b\n---\nadd(1, 2)')
    const header = doc.header as DWHeader
    expect(header.directives.length).toBe(1)
    const funDir = header.directives[0] as DWFunDirective
    expect(funDir.kind).toBe('FunDirective')
    expect(funDir.name).toBe('add')
    expect(funDir.params.length).toBe(2)
    expect(funDir.params[0].name).toBe('a')
    expect(funDir.params[1].name).toBe('b')
    expect(funDir.body.kind).toBe('BinaryExpr')
  })

  it('fun directive body is FunctionCall in script body', () => {
    const doc = parse('%dw 2.0\nfun add(a, b) = a + b\n---\nadd(1, 2)')
    expect(doc.body.kind).toBe('FunctionCall')
    if (doc.body.kind === 'FunctionCall') {
      expect(doc.body.callee.kind).toBe('Identifier')
      if (doc.body.callee.kind === 'Identifier') {
        expect(doc.body.callee.name).toBe('add')
      }
      expect(doc.body.args.length).toBe(2)
    }
  })

  it('parses output directive', () => {
    const doc = parse('%dw 2.0\noutput application/xml\n---\n{}')
    const header = doc.header as DWHeader
    const out = header.directives[0] as DWOutputDirective
    expect(out.kind).toBe('OutputDirective')
    expect(out.mimeType).toBe('application/xml')
  })

  it('parses multiple header directives', () => {
    const doc = parse('%dw 2.0\noutput application/json\nvar limit = 10\n---\n[]')
    const header = doc.header as DWHeader
    expect(header.directives.length).toBe(2)
    expect(header.directives[0].kind).toBe('OutputDirective')
    expect(header.directives[1].kind).toBe('VarDirective')
  })
})

// ─── 3. Operator Precedence ───────────────────────────────────────────────────

describe('Operator precedence', () => {
  it('* binds tighter than +: 1 + 2 * 3', () => {
    const doc = parse('1 + 2 * 3')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('+')
      expect(doc.body.left.kind).toBe('Literal')
      expect(doc.body.right.kind).toBe('BinaryExpr')
      if (doc.body.right.kind === 'BinaryExpr') {
        expect(doc.body.right.op).toBe('*')
        expect(doc.body.right.left.kind).toBe('Literal')
        if (doc.body.right.left.kind === 'Literal') {
          expect(doc.body.right.left.value).toBe('2')
        }
      }
    }
  })

  it('and binds tighter than or: a and b or c', () => {
    const doc = parse('a and b or c')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('or')
      expect(doc.body.left.kind).toBe('BinaryExpr')
      if (doc.body.left.kind === 'BinaryExpr') {
        expect(doc.body.left.op).toBe('and')
      }
      expect(doc.body.right.kind).toBe('Identifier')
      if (doc.body.right.kind === 'Identifier') {
        expect(doc.body.right.name).toBe('c')
      }
    }
  })

  it('is binds tighter than ==: a == b is String', () => {
    const doc = parse('a == b is String')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('==')
      expect(doc.body.right.kind).toBe('BinaryExpr')
      if (doc.body.right.kind === 'BinaryExpr') {
        expect(doc.body.right.op).toBe('is')
      }
    }
  })

  it('as binds tighter than +: a + b as String', () => {
    const doc = parse('a + b as String')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('+')
      expect(doc.body.right.kind).toBe('BinaryExpr')
      if (doc.body.right.kind === 'BinaryExpr') {
        expect(doc.body.right.op).toBe('as')
      }
    }
  })

  it('value as String produces BinaryExpr with op=as', () => {
    const doc = parse('value as String')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('as')
      expect(doc.body.left.kind).toBe('Identifier')
      expect(doc.body.right.kind).toBe('Identifier')
    }
  })

  it('left-associativity: 1 + 2 + 3', () => {
    const doc = parse('1 + 2 + 3')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('+')
      // Left-assoc: (1+2)+3 so left is BinaryExpr
      expect(doc.body.left.kind).toBe('BinaryExpr')
      expect(doc.body.right.kind).toBe('Literal')
    }
  })
})

// ─── 4. Expressions ───────────────────────────────────────────────────────────

describe('Expressions', () => {
  it('parses empty object literal {}', () => {
    const doc = parse('{}')
    expect(doc.body.kind).toBe('ObjectExpr')
    if (doc.body.kind === 'ObjectExpr') {
      expect(doc.body.entries.length).toBe(0)
    }
  })

  it('parses object with entries {a: 1, b: "hello"}', () => {
    const doc = parse('{a: 1, b: "hello"}')
    expect(doc.body.kind).toBe('ObjectExpr')
    if (doc.body.kind === 'ObjectExpr') {
      expect(doc.body.entries.length).toBe(2)
      const first = doc.body.entries[0]
      expect(first.key.kind).toBe('Identifier')
      if (first.key.kind === 'Identifier') {
        expect(first.key.name).toBe('a')
      }
      expect(first.value.kind).toBe('Literal')
      if (first.value.kind === 'Literal') {
        expect(first.value.value).toBe('1')
      }
    }
  })

  it('parses full script with object body', () => {
    const doc = parse('%dw 2.0\noutput application/json\n---\n{a: 1, b: "hello"}')
    expect(doc.body.kind).toBe('ObjectExpr')
    if (doc.body.kind === 'ObjectExpr') {
      expect(doc.body.entries.length).toBe(2)
    }
  })

  it('parses array literal [1, 2, 3]', () => {
    const doc = parse('[1, 2, 3]')
    expect(doc.body.kind).toBe('ArrayExpr')
    if (doc.body.kind === 'ArrayExpr') {
      expect(doc.body.elements.length).toBe(3)
      expect(doc.body.elements[0].kind).toBe('Literal')
      if (doc.body.elements[0].kind === 'Literal') {
        expect(doc.body.elements[0].value).toBe('1')
      }
    }
  })

  it('parses if/else expression', () => {
    const doc = parse('if (x > 0) "pos" else "neg"')
    expect(doc.body.kind).toBe('IfExpr')
    if (doc.body.kind === 'IfExpr') {
      expect(doc.body.cond.kind).toBe('BinaryExpr')
      expect(doc.body.then.kind).toBe('Literal')
      expect(doc.body.else_).not.toBeNull()
      if (doc.body.else_ !== null) {
        expect(doc.body.else_.kind).toBe('Literal')
      }
    }
  })

  it('parses if without else', () => {
    const doc = parse('if (x) y')
    expect(doc.body.kind).toBe('IfExpr')
    if (doc.body.kind === 'IfExpr') {
      expect(doc.body.else_).toBeNull()
    }
  })

  it('parses lambda (x) -> x + 1', () => {
    const doc = parse('(x) -> x + 1')
    expect(doc.body.kind).toBe('Lambda')
    if (doc.body.kind === 'Lambda') {
      expect(doc.body.params.length).toBe(1)
      expect(doc.body.params[0].name).toBe('x')
      expect(doc.body.body.kind).toBe('BinaryExpr')
    }
  })

  it('parses multi-param lambda (x, y) -> x ++ y', () => {
    const doc = parse('(x, y) -> x ++ y')
    expect(doc.body.kind).toBe('Lambda')
    if (doc.body.kind === 'Lambda') {
      expect(doc.body.params.length).toBe(2)
      expect(doc.body.params[0].name).toBe('x')
      expect(doc.body.params[1].name).toBe('y')
    }
  })

  it('parses lambda with type annotations (x: String, y: Number) -> x', () => {
    const doc = parse('(x: String, y: Number) -> x')
    expect(doc.body.kind).toBe('Lambda')
    if (doc.body.kind === 'Lambda') {
      expect(doc.body.params.length).toBe(2)
      expect(doc.body.params[0].typeAnnotation).toBe('String')
      expect(doc.body.params[1].typeAnnotation).toBe('Number')
    }
  })

  it('parses number literals', () => {
    const doc = parse('3.14')
    expect(doc.body.kind).toBe('Literal')
    if (doc.body.kind === 'Literal') {
      expect(doc.body.literalType).toBe('number')
      expect(doc.body.value).toBe('3.14')
    }
  })

  it('parses boolean literal true', () => {
    const doc = parse('true')
    expect(doc.body.kind).toBe('Literal')
    if (doc.body.kind === 'Literal') {
      expect(doc.body.literalType).toBe('boolean')
    }
  })

  it('parses null literal', () => {
    const doc = parse('null')
    expect(doc.body.kind).toBe('Literal')
    if (doc.body.kind === 'Literal') {
      expect(doc.body.literalType).toBe('null')
    }
  })

  it('parses string literal', () => {
    const doc = parse('"hello"')
    expect(doc.body.kind).toBe('Literal')
    if (doc.body.kind === 'Literal') {
      expect(doc.body.literalType).toBe('string')
      expect(doc.body.value).toBe('"hello"')
    }
  })

  it('parses unary minus', () => {
    const doc = parse('-1')
    // May be parsed as a Literal (negative number) or UnaryExpr depending on lexer
    // The lexer handles negative numbers in certain contexts, but standalone -1 may
    // start with Minus + Int
    expect(['Literal', 'UnaryExpr']).toContain(doc.body.kind)
  })

  it('parses unary not', () => {
    const doc = parse('not true')
    expect(doc.body.kind).toBe('UnaryExpr')
    if (doc.body.kind === 'UnaryExpr') {
      expect(doc.body.op).toBe('not')
    }
  })
})

// ─── 5. Selectors ─────────────────────────────────────────────────────────────

describe('Selectors', () => {
  it('dot selector: payload.name', () => {
    const doc = parse('payload.name')
    expect(doc.body.kind).toBe('SelectorExpr')
    if (doc.body.kind === 'SelectorExpr') {
      expect(doc.body.selectorKind).toBe('dot')
      expect(doc.body.selector).toBe('name')
      expect(doc.body.expr.kind).toBe('Identifier')
    }
  })

  it('bracket selector: payload.items[0]', () => {
    const doc = parse('payload.items[0]')
    expect(doc.body.kind).toBe('SelectorExpr')
    const sel = doc.body as any
    expect(sel.selectorKind).toBe('bracket')
    expect(sel.expr.kind).toBe('SelectorExpr')
    expect(sel.indexExpr).toBeDefined()
    expect(sel.indexExpr.kind).toBe('Literal')
    expect(sel.indexExpr.value).toBe('0')
  })

  it('dotdot selector: payload..name', () => {
    const doc = parse('payload..name')
    expect(doc.body.kind).toBe('SelectorExpr')
    if (doc.body.kind === 'SelectorExpr') {
      expect(doc.body.selectorKind).toBe('dotdot')
      expect(doc.body.selector).toBe('name')
    }
  })

  it('chained dot selectors: a.b.c', () => {
    const doc = parse('a.b.c')
    expect(doc.body.kind).toBe('SelectorExpr')
    if (doc.body.kind === 'SelectorExpr') {
      expect(doc.body.selector).toBe('c')
      expect(doc.body.expr.kind).toBe('SelectorExpr')
      if (doc.body.expr.kind === 'SelectorExpr') {
        expect(doc.body.expr.selector).toBe('b')
      }
    }
  })

  it('? filter selector: payload.items?', () => {
    const doc = parse('payload.items?')
    expect(doc.body.kind).toBe('SelectorExpr')
    if (doc.body.kind === 'SelectorExpr') {
      expect(doc.body.selectorKind).toBe('filter')
      expect(doc.body.selector).toBe('?')
    }
  })
})

// ─── 6. Function Calls ────────────────────────────────────────────────────────

describe('Function calls', () => {
  it('parses simple function call: add(1, 2)', () => {
    const doc = parse('add(1, 2)')
    expect(doc.body.kind).toBe('FunctionCall')
    if (doc.body.kind === 'FunctionCall') {
      expect(doc.body.callee.kind).toBe('Identifier')
      expect(doc.body.args.length).toBe(2)
    }
  })

  it('parses chained method call: items.filter((x) -> x > 0)', () => {
    const doc = parse('items.filter((x) -> x > 0)')
    expect(doc.body.kind).toBe('FunctionCall')
    if (doc.body.kind === 'FunctionCall') {
      expect(doc.body.callee.kind).toBe('SelectorExpr')
      expect(doc.body.args.length).toBe(1)
      expect(doc.body.args[0].kind).toBe('Lambda')
    }
  })
})

// ─── 7. Comments ─────────────────────────────────────────────────────────────

describe('Comments', () => {
  it('attaches leading comment to object body', () => {
    const doc = parse('// leading\n{a: 1}')
    expect(doc.body.kind).toBe('ObjectExpr')
    if (doc.body.kind === 'ObjectExpr') {
      expect(doc.body.leadingComments).toBeDefined()
      expect(doc.body.leadingComments?.length).toBeGreaterThan(0)
      expect(doc.body.leadingComments?.[0]).toContain('leading')
    }
  })

  it('handles block comments without crashing', () => {
    const doc = parse('/* comment */ {a: 1}')
    expect(doc.body.kind).toBe('ObjectExpr')
  })

  it('parses script with comment in header', () => {
    const doc = parse('%dw 2.0\n// output comment\noutput application/json\n---\n{}')
    expect(doc.header).not.toBeNull()
  })
})

// ─── 8. Error Handling ────────────────────────────────────────────────────────

describe('Error handling', () => {
  it('throws ParseError for leading @ token', () => {
    expect(() => parse('@@@')).toThrow(ParseError)
  })

  it('throws ParseError for unclosed object', () => {
    expect(() => parse('{a: 1')).toThrow(ParseError)
  })

  it('throws ParseError for unclosed array', () => {
    expect(() => parse('[1, 2, 3')).toThrow(ParseError)
  })

  it('ParseError has line and col info', () => {
    try {
      parse('@@@')
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError)
      if (e instanceof ParseError) {
        expect(e.line).toBeDefined()
        expect(e.col).toBeDefined()
      }
    }
  })

  it('ParseError is an Error', () => {
    const err = new ParseError('test error', 1, 1)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ParseError')
    expect(err.message).toBe('test error')
  })
})

// ─── 9. Postfix Conditional ───────────────────────────────────────────────────

describe('Postfix conditional', () => {
  it('value if (condition) produces ConditionalExpr', () => {
    const doc = parse('value if (condition)')
    expect(doc.body.kind).toBe('ConditionalExpr')
    if (doc.body.kind === 'ConditionalExpr') {
      expect(doc.body.expr.kind).toBe('Identifier')
      expect(doc.body.condition.kind).toBe('Identifier')
    }
  })
})

// ─── 10. Edge Cases ───────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('parses nested objects', () => {
    const doc = parse('{outer: {inner: 1}}')
    expect(doc.body.kind).toBe('ObjectExpr')
    if (doc.body.kind === 'ObjectExpr') {
      expect(doc.body.entries[0].value.kind).toBe('ObjectExpr')
    }
  })

  it('parses nested arrays', () => {
    const doc = parse('[[1, 2], [3, 4]]')
    expect(doc.body.kind).toBe('ArrayExpr')
    if (doc.body.kind === 'ArrayExpr') {
      expect(doc.body.elements[0].kind).toBe('ArrayExpr')
    }
  })

  it('parses comparison operators', () => {
    const doc = parse('a >= b')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('>=')
    }
  })

  it('parses string concatenation ++', () => {
    const doc = parse('"a" ++ "b"')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('++')
    }
  })

  it('parses parenthesised expression', () => {
    const doc = parse('(1 + 2)')
    expect(doc.body.kind).toBe('EnclosedExpr')
    if (doc.body.kind === 'EnclosedExpr') {
      expect(doc.body.expr.kind).toBe('BinaryExpr')
    }
  })

  it('parses default operator', () => {
    const doc = parse('x default "fallback"')
    expect(doc.body.kind).toBe('BinaryExpr')
    if (doc.body.kind === 'BinaryExpr') {
      expect(doc.body.op).toBe('default')
    }
  })
})
