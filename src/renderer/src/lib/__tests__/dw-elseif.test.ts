import { describe, it, expect } from 'vitest'
import { parse, ParseError } from '../dw-parser'

describe('else-if with comments and blank lines', () => {
  it('parses if/else chain with comments between', () => {
    const src = `%dw 2.0
---
// SM-1493 BEGIN
if (x == "89") "CHANGED_KWS"
// SM-1493 END

else if(y) "CANCELLED_KWS"

// SM-859 BEGIN
else if (z and w) "ACCEPTED"
// SM-859 END

else if(a) "CHANGED_KWS"
else if(b) "CREATED"
else if (c == "NEW") "CREATED"
else d default "CREATED"`
    let error: string | null = null
    try { parse(src) }
    catch (e: any) {
      error = e instanceof ParseError ? `L${e.line}:${e.col}: ${e.message}` : String(e)
    }
    expect(error, `${error}`).toBeNull()
  })

  it('var = if/else chain with comments', () => {
    const src = `%dw 2.0
var x = 
// comment
if (a) "one"
// comment
else if(b) "two"
else "three"
---
x`
    let error: string | null = null
    try { parse(src) }
    catch (e: any) {
      error = e instanceof ParseError ? `L${e.line}:${e.col}: ${e.message}` : String(e)
    }
    expect(error, `${error}`).toBeNull()
  })
})
