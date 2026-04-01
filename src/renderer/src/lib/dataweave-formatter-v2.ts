// DataWeave Formatter V2 — AST-based drop-in replacement for formatDataWeave()
//
// Pipeline: source → lex → parse → printDoc → render → formatted string
//
// On ParseError: returns original source unchanged (safe bail-out).
// On other errors: rethrows (unexpected; indicates a printer bug).

import { parse, ParseError } from './dw-parser'
import { printDoc, render, setIndentSize } from './dw-printer'

export interface FormatOptions {
  /** Maximum line width before breaking. Default: 120 */
  lineWidth?: number
  /** Number of spaces per indentation level. Default: 2 */
  indentSize?: number
}

const DEFAULT_LINE_WIDTH = 120
const DEFAULT_INDENT_SIZE = 2

/**
 * Format a DataWeave source string using the AST-based pretty-printer.
 *
 * - Returns original source unchanged if it cannot be parsed.
 * - Guarantees a trailing newline.
 */
export function formatDataWeave(src: string, options?: FormatOptions): string {
  const lineWidth = options?.lineWidth ?? DEFAULT_LINE_WIDTH
  const indentSize = options?.indentSize ?? DEFAULT_INDENT_SIZE
  try {
    setIndentSize(indentSize)
    const ast = parse(src)
    const doc = printDoc(ast)
    const result = render(doc, lineWidth)
    return result.endsWith('\n') ? result : result + '\n'
  } catch (e) {
    console.warn('[DW Formatter] Failed to format:', e instanceof ParseError
      ? `ParseError at L${(e as any).line}:${(e as any).col}: ${(e as any).message}`
      : String(e))
    return src
  }
}

/**
 * Format only a selected region of DataWeave source.
 *
 * @param fullSrc - the full document source
 * @param startLine - 1-based start line of the selection
 * @param endLine - 1-based end line of the selection
 * @param options - formatting options (lineWidth, indentSize)
 * @returns { text: string; startLine: number; endLine: number } — the formatted
 *   text and the (1-based) line range it should replace, or null if formatting
 *   the selection is not possible (caller should fall back to full format).
 */
export function formatDataWeaveRange(
  fullSrc: string,
  startLine: number,
  endLine: number,
  options?: FormatOptions,
): { text: string; startLine: number; endLine: number } | null {
  const lineWidth = options?.lineWidth ?? DEFAULT_LINE_WIDTH
  const indentSize = options?.indentSize ?? DEFAULT_INDENT_SIZE
  const lines = fullSrc.split('\n')
  // Clamp to valid range
  const sl = Math.max(1, startLine)
  const el = Math.min(lines.length, endLine)

  const selectedLines = lines.slice(sl - 1, el)
  const selectedText = selectedLines.join('\n')

  // Detect base indentation (minimum non-empty line indent)
  let baseIndent = Infinity
  for (const line of selectedLines) {
    if (line.trim().length === 0) continue
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0
    if (indent < baseIndent) baseIndent = indent
  }
  if (baseIndent === Infinity) baseIndent = 0
  const indentStr = ' '.repeat(baseIndent)

  // Strip base indentation
  const stripped = selectedLines
    .map((l) => (l.trim().length === 0 ? '' : l.slice(baseIndent)))
    .join('\n')

  // Try to format the selection by wrapping it in different DW document shells.
  // The selection could be: a full document, a body expression, header directives,
  // or a mix. We try multiple strategies and use the first that parses.
  const startsWithDirective = /^(var|fun|type|ns|import|input|output)\b/.test(stripped)

  type Attempt = { src: string; extract: (formatted: string) => string }
  const attempts: Attempt[] = [
    // 1. As-is (might be a full document)
    { src: stripped, extract: (f) => f },
    // 2. As body expression
    { src: `%dw 2.0\n---\n${stripped}`, extract: (f) => f.slice(f.indexOf('---\n') + 4) },
  ]
  if (startsWithDirective) {
    // 3. As header directives (var/fun) with dummy body
    attempts.push({
      src: `%dw 2.0\n${stripped}\n---\n0`,
      extract: (f) => {
        // Strip %dw line and the trailing ---\n0
        const lines = f.split('\n')
        // Remove first line (%dw 2.0) and last two lines (---\n0)
        const start = lines.findIndex((l) => !l.startsWith('%dw'))
        const end = lines.lastIndexOf('---')
        if (start >= 0 && end > start) {
          return lines.slice(start, end).join('\n')
        }
        return f
      },
    })
  }

  // Compare non-whitespace content to detect if formatting lost significant content
  const strippedNonWs = stripped.replace(/\s+/g, '')

  setIndentSize(indentSize)
  for (const attempt of attempts) {
    try {
      const ast = parse(attempt.src)
      const doc = printDoc(ast)
      let result = render(doc, lineWidth - baseIndent)

      // Extract just the selection's portion from the formatted full document
      result = attempt.extract(result)

      // Remove trailing newline (the editor range replacement handles line endings)
      result = result.replace(/\n$/, '')

      // Safety check: if the formatted result lost significant content compared
      // to the input, skip this attempt. This catches cases where the parser
      // consumed only part of the selection (e.g. a partial object fragment).
      const resultNonWs = result.replace(/\s+/g, '')
      if (resultNonWs.length < strippedNonWs.length * 0.8) {
        continue
      }

      // Re-apply base indentation
      const reindented = result
        .split('\n')
        .map((l) => (l.trim().length === 0 ? '' : indentStr + l))
        .join('\n')

      return { text: reindented, startLine: sl, endLine: el }
    } catch {
      continue
    }
  }

  // Could not format selection — return null so caller can fall back
  return null
}
