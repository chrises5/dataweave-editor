// DataWeave Formatter V2 — AST-based drop-in replacement for formatDataWeave()
//
// Pipeline: source → lex → parse → printDoc → render → formatted string
//
// On ParseError: returns original source unchanged (safe bail-out).
// On other errors: rethrows (unexpected; indicates a printer bug).

import { parse, ParseError } from './dw-parser'
import { printDoc, render } from './dw-printer'

/**
 * Format a DataWeave source string using the AST-based pretty-printer.
 *
 * Drop-in replacement for the heuristic formatter in dataweave-formatter.ts.
 * Same signature: (src: string) => string.
 *
 * - Uses 80-character line width for group breaking.
 * - Returns original source unchanged if it cannot be parsed.
 * - Guarantees a trailing newline.
 */
export function formatDataWeave(src: string): string {
  try {
    const ast = parse(src)
    const doc = printDoc(ast)
    const result = render(doc, 80)
    // Ensure trailing newline
    return result.endsWith('\n') ? result : result + '\n'
  } catch (e) {
    if (e instanceof ParseError) {
      // Bail out: return original source unchanged
      return src
    }
    throw e
  }
}
