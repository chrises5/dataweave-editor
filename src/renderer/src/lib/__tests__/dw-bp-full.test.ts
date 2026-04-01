import { it, expect } from 'vitest'
import { parse, ParseError } from '../dw-parser'
import { formatDataWeave } from '../dataweave-formatter-v2'
import { readFileSync } from 'fs'
import { join } from 'path'

const SCRIPT = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'test.dwl'), 'utf-8')

it('parses full BP script', () => {
  let error: string | null = null
  try {
    parse(SCRIPT)
  } catch (e) {
    if (e instanceof ParseError) {
      error = `ParseError at L${(e as any).line}:${(e as any).col}: ${e.message}`
    } else {
      error = String(e)
    }
  }
  expect(error, `Parse failed: ${error}`).toBeNull()
})

it('formats full BP script', () => {
  const result = formatDataWeave(SCRIPT)
  expect(result).not.toBe(SCRIPT)
})
