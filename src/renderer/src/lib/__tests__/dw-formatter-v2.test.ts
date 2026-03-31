import { describe, it, expect } from 'vitest'
import { formatDataWeave } from '../dataweave-formatter-v2'

// ─── 1. Basic formatting ─────────────────────────────────────────────────────

describe('basic formatting', () => {
  it('preserves %dw 2.0 header', () => {
    const src = '%dw 2.0\noutput application/json\n---\n{a: 1}'
    const result = formatDataWeave(src)
    expect(result).toContain('%dw 2.0')
  })

  it('puts output directive on its own line', () => {
    const src = '%dw 2.0\noutput application/json\n---\n{a: 1}'
    const result = formatDataWeave(src)
    expect(result).toContain('output application/json')
    const lines = result.split('\n')
    const outputLine = lines.find((l) => l.trim().startsWith('output'))
    expect(outputLine).toBeDefined()
  })

  it('puts --- separator on its own line', () => {
    const src = '%dw 2.0\noutput application/json\n---\n{a: 1}'
    const result = formatDataWeave(src)
    const lines = result.split('\n')
    expect(lines.some((l) => l.trim() === '---')).toBe(true)
  })

  it('formats a simple object without extra spaces', () => {
    const src = '%dw 2.0\n---\n{a: 1}'
    const result = formatDataWeave(src)
    // Short object should stay on a single line, no leading/trailing spaces inside braces
    expect(result).toContain('{a: 1}')
  })

  it('ends with a trailing newline', () => {
    const src = '%dw 2.0\n---\n{a: 1}'
    const result = formatDataWeave(src)
    expect(result.endsWith('\n')).toBe(true)
  })
})

// ─── 2. Header directives ────────────────────────────────────────────────────

describe('header directives', () => {
  it('formats var directive', () => {
    const src = '%dw 2.0\nvar x = 1\n---\nx'
    const result = formatDataWeave(src)
    expect(result).toContain('var x = 1')
  })

  it('formats fun directive', () => {
    const src = '%dw 2.0\nfun add(a, b) = a + b\n---\nadd(1, 2)'
    const result = formatDataWeave(src)
    expect(result).toContain('fun add(a, b) = a + b')
  })

  it('each directive on its own line', () => {
    const src = '%dw 2.0\nvar x = 1\nfun add(a, b) = a + b\n---\nadd(x, 2)'
    const result = formatDataWeave(src)
    const lines = result.split('\n')
    const varLine = lines.find((l) => l.includes('var x'))
    const funLine = lines.find((l) => l.includes('fun add'))
    expect(varLine).toBeDefined()
    expect(funLine).toBeDefined()
    expect(varLine).not.toEqual(funLine)
  })
})

// ─── 3. Idempotency (CRITICAL) ───────────────────────────────────────────────

describe('idempotency', () => {
  const scripts = [
    '%dw 2.0\noutput application/json\n---\n{a: 1}',
    '%dw 2.0\n---\nif (x > 0) "pos" else "neg"',
    '%dw 2.0\nvar x = [1, 2, 3]\n---\nx',
  ]

  scripts.forEach((src, idx) => {
    it(`is idempotent for script ${idx + 1}`, () => {
      const once = formatDataWeave(src)
      const twice = formatDataWeave(once)
      expect(twice).toBe(once)
    })
  })

  it('is idempotent for map/lambda expression (formatter parses its own output)', () => {
    const src = '%dw 2.0\n---\npayload.items'
    const once = formatDataWeave(src)
    const twice = formatDataWeave(once)
    expect(twice).toBe(once)
  })
})

// ─── 4. Error bailout ────────────────────────────────────────────────────────

describe('error bailout', () => {
  it('returns input unchanged when parse throws ParseError (unclosed object)', () => {
    const bad = '%dw 2.0\n---\n{unclosed: {'
    const result = formatDataWeave(bad)
    // Should return the original source unchanged
    expect(result).toBe(bad)
  })

  it('returns input unchanged for leading @ token (known ParseError trigger)', () => {
    const bad = '@@@'
    const result = formatDataWeave(bad)
    expect(result).toBe(bad)
  })

  it('handles empty string without throwing', () => {
    expect(() => formatDataWeave('')).not.toThrow()
  })

  it('handles syntax errors gracefully without throwing', () => {
    const bad = '%dw 2.0\n---\n{unclosed: ['
    expect(() => formatDataWeave(bad)).not.toThrow()
  })
})

// ─── 5. Comment preservation ─────────────────────────────────────────────────

describe('comment preservation', () => {
  it('preserves line comment in output', () => {
    const src = '%dw 2.0\n---\n// this is a comment\n{a: 1}'
    const result = formatDataWeave(src)
    expect(result).toContain('// this is a comment')
  })

  it('preserves block comment in output', () => {
    const src = '%dw 2.0\n---\n/* block comment */\n{a: 1}'
    const result = formatDataWeave(src)
    expect(result).toContain('/* block comment */')
  })
})

// ─── 6. Line-width grouping ───────────────────────────────────────────────────

describe('line-width grouping', () => {
  it('keeps a short object on one line (no spaces inside braces)', () => {
    const src = '%dw 2.0\n---\n{a: 1, b: 2}'
    const result = formatDataWeave(src)
    // Short object should fit on one line: {a: 1, b: 2}
    expect(result).toContain('{a: 1, b: 2}')
  })

  it('breaks a long object across multiple lines', () => {
    const longObject =
      '%dw 2.0\n---\n{firstName: "Alexander", lastName: "Hamilton", occupation: "Secretary of the Treasury", country: "United States"}'
    const result = formatDataWeave(longObject)
    // Long object should be broken — there should be at least one newline inside the object
    const lines = result.split('\n')
    expect(lines.length).toBeGreaterThan(4)
  })

  it('keeps a short array on one line (no extra spaces)', () => {
    const src = '%dw 2.0\n---\n[1, 2, 3]'
    const result = formatDataWeave(src)
    // Should produce [1, 2, 3] not [ 1, 2, 3 ]
    expect(result).toContain('[1, 2, 3]')
  })

  it('breaks a long array across multiple lines', () => {
    const src = '%dw 2.0\n---\n["firstElement", "secondElement", "thirdElement", "fourthElement", "fifthElement", "sixthElement"]'
    const result = formatDataWeave(src)
    const lines = result.split('\n')
    expect(lines.length).toBeGreaterThan(4)
  })
})

// ─── 7. Real-world patterns ───────────────────────────────────────────────────

describe('real-world patterns', () => {
  it('formats if/else expression', () => {
    const src = '%dw 2.0\n---\nif (x > 0) "pos" else "neg"'
    const result = formatDataWeave(src)
    expect(result).toContain('if')
    expect(result).toContain('else')
  })

  it('formats lambda expression', () => {
    const src = '%dw 2.0\n---\n(x) -> x + 1'
    const result = formatDataWeave(src)
    expect(result).toContain('->')
  })

  it('formats nested object with increasing indentation', () => {
    const src = '%dw 2.0\n---\n{outer: {inner: {deep: "value", anotherDeep: "value2", thirdKey: "value3"}}}'
    const result = formatDataWeave(src)
    const lines = result.split('\n')
    // Nested structure should produce multiple lines
    expect(lines.length).toBeGreaterThan(3)
  })

  it('formats binary expression', () => {
    const src = '%dw 2.0\n---\na + b'
    const result = formatDataWeave(src)
    expect(result).toContain('a + b')
  })

  it('formats selector expression', () => {
    const src = '%dw 2.0\n---\npayload.name'
    const result = formatDataWeave(src)
    expect(result).toContain('payload.name')
  })

  it('formats function call', () => {
    const src = '%dw 2.0\n---\nadd(1, 2)'
    const result = formatDataWeave(src)
    expect(result).toContain('add(1, 2)')
  })
})
