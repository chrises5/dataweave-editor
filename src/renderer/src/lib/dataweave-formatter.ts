// DataWeave source code formatter
// Based on the grammar from mulesoft/data-weave-intellij-plugin Weave.bnf

const INDENT = '  '

interface Token {
  type: 'string' | 'comment' | 'blockComment' | 'code' | 'regex'
  value: string
}

/**
 * Tokenize DW source into strings, comments, and code segments
 * so we don't reformat inside strings/comments.
 */
function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < src.length) {
    // Block comment
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      tokens.push({ type: 'blockComment', value: src.slice(i, stop) })
      i = stop
    }
    // Line comment
    else if (src[i] === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      tokens.push({ type: 'comment', value: src.slice(i, stop) })
      i = stop
    }
    // Double-quoted string (with interpolation and escapes)
    else if (src[i] === '"') {
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
      tokens.push({ type: 'string', value: src.slice(i, j) })
      i = j
    }
    // Single-quoted string
    else if (src[i] === "'") {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === "'") { j++; break }
        j++
      }
      tokens.push({ type: 'string', value: src.slice(i, j) })
      i = j
    }
    // Regex literal: /.../ but not // (line comment) or /* (block comment)
    else if (src[i] === '/' && src[i + 1] !== '/' && src[i + 1] !== '*') {
      // Only treat as regex if preceded by operator, keyword, or start
      const prevCode = tokens.filter((t) => t.type === 'code').pop()?.value.trimEnd() ?? ''
      const lastChar = prevCode[prevCode.length - 1]
      const isRegex = !lastChar || /[=(:,~\[{!&|^+\-*/%<>]/.test(lastChar)
      if (isRegex) {
        let j = i + 1
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue }
          if (src[j] === '/') { j++; break }
          if (src[j] === '\n') break
          j++
        }
        tokens.push({ type: 'regex', value: src.slice(i, j) })
        i = j
      } else {
        tokens.push({ type: 'code', value: src[i] })
        i++
      }
    }
    // Code
    else {
      let j = i
      while (j < src.length && src[j] !== '/' && src[j] !== '"' && src[j] !== "'") {
        j++
      }
      tokens.push({ type: 'code', value: src.slice(i, j) })
      i = j
    }
  }
  return tokens
}

/**
 * Rebuild source from tokens, applying formatter only to code tokens.
 */
function reassemble(tokens: Token[]): string {
  return tokens.map((t) => t.value).join('')
}

/**
 * Normalize a code segment: collapse multiple blank lines, trim trailing whitespace per line.
 */
function normalizeWhitespace(code: string): string {
  return code
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * Find the top-level --- separator that divides header from body.
 * Must be on its own line and at bracket depth 0 (not inside a do {} block).
 */
function splitHeaderBody(src: string): { header: string; body: string } | null {
  const lines = src.split('\n')
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '---' && depth === 0 && i > 0) {
      return {
        header: lines.slice(0, i).join('\n') + '\n',
        body: lines.slice(i).join('\n'),
      }
    }
    depth += countUnquoted(trimmed, ['{', '['])
    depth -= countUnquoted(trimmed, ['}', ']'])
    depth = Math.max(0, depth)
  }
  return null
}

/**
 * Reindent code based on bracket depth.
 * baseDepth is the starting indentation level (0 for body, 0 for header).
 */
function reindent(code: string, baseDepth: number = 0): string {
  const tokens = tokenize(code)
  const full = reassemble(tokens)
  const lines = full.split('\n')
  const result: string[] = []
  let depth = baseDepth
  // afterIfElse: the previous line was an if()/else without braces,
  // so this line is the body — indent +1 then revert depth
  let afterIfElse = false
  let depthBeforeIfElse = 0
  // parenDepth: tracks unclosed parens for continuation indentation
  let parenDepth = 0
  let prevParenDepth = 0
  // eqContinuation: true when previous line ended with = (value on next lines)
  let eqContinuation = false
  // prevEndedWithArrow: previous line ended with -> (lambda body on next line)
  let prevEndedWithArrow = false
  // prevEndedWithDo: previous line ended with 'do' (block on next line)
  let prevEndedWithDo = false
  // Stack of deferred depth adjustments to apply when a } closes
  const deferredCloseAdjust: number[] = []

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      result.push('')
      afterIfElse = false
      continue
    }

    // Only track { } and [ ] for indentation — parens are ignored
    const opensOnLine = countUnquoted(trimmed, ['{', '['])
    const closesOnLine = countUnquoted(trimmed, ['}', ']'])
    const stripped = stripStrings(trimmed)

    // If previous line ended with -> or do, and this line starts with {,
    // treat as a lambda/do block opening: reset paren depth
    const isBlockAfterDoOrArrow = (prevEndedWithArrow || prevEndedWithDo) && /^\{/.test(trimmed)
    if (isBlockAfterDoOrArrow) {
      parenDepth = 0
    }
    prevEndedWithArrow = false
    prevEndedWithDo = false

    // Line classification
    const startsWithClose = /^[}\]]/.test(trimmed)
    const isMatchElse = /^else\s*->/.test(trimmed)
    const startsWithElse = !isMatchElse && /^else\b/.test(trimmed)

    // End = continuation when we hit a new declaration or --- at base depth
    if (eqContinuation && parenDepth === 0) {
      if (/^(var|fun|type|ns|import)\b/.test(trimmed) || trimmed === '---' || startsWithClose) {
        depth = Math.max(0, depth - 1)
        eqContinuation = false
      }
      // Also end on a line ending with , at paren depth 0 (after this line is emitted)
    }

    // Track paren depth: compute this line's paren delta
    const parenOpens = countUnquoted(trimmed, ['('])
    const parenCloses = countUnquoted(trimmed, [')'])
    const parenDelta = parenOpens - parenCloses

    // Paren indent for this line: based on unclosed parens from *before* this line,
    // but reduced by any closing parens at the start of this line.
    // Binary operators (and/or/++) after a paren group closes keep indent of 1
    // to stay aligned with the expression they continue.
    const leadingParenCloses = /^\)*/.exec(trimmed)?.[0].length ?? 0
    const rawParenIndent = Math.max(0, parenDepth - leadingParenCloses)
    const isContinuationOp = /^(and|or|\+\+)\b/.test(trimmed)
    const parenIndent = (isContinuationOp && rawParenIndent === 0 && prevParenDepth > 0) ? 1
      : rawParenIndent

    if (startsWithClose) {
      afterIfElse = false
      depth = Math.max(0, depth - closesOnLine)
      // Apply deferred depth adjustments from do/arrow blocks
      if (/^\}/.test(trimmed) && deferredCloseAdjust.length > 0) {
        depth = Math.max(0, depth + deferredCloseAdjust.pop()!)
      }
      result.push(INDENT.repeat(depth + parenIndent) + trimmed)
      depth += opensOnLine
    } else if (startsWithElse) {
      if (afterIfElse) {
        depth = depthBeforeIfElse
      }
      afterIfElse = false
      const elseDepth = depth
      result.push(INDENT.repeat(elseDepth + parenIndent) + trimmed)
      const elseStripped = stripStrings(trimmed)
      // "else if(cond) value" — inline if with body on same line
      const hasInlineIfBody = /^else\s+if\s*\(.*\)\s+\S/.test(elseStripped)
      // "else value" — else with body on same line (not followed by if/do/{)
      const hasInlineElseBody = !hasInlineIfBody && /^else\s+(?!if\b|do\b|\{)\S/.test(elseStripped)
      if (hasInlineIfBody || hasInlineElseBody) {
        depth = elseDepth + opensOnLine - closesOnLine
      } else if (opensOnLine === 0) {
        depthBeforeIfElse = elseDepth
        afterIfElse = true
        depth = elseDepth + 1
      } else {
        depth = elseDepth + opensOnLine - closesOnLine
      }
    } else if (afterIfElse) {
      result.push(INDENT.repeat(depth + parenIndent) + trimmed)
      depth = depthBeforeIfElse + opensOnLine - closesOnLine
      afterIfElse = false
    } else {
      result.push(INDENT.repeat(depth + parenIndent) + trimmed)
      depth = Math.max(0, depth + opensOnLine - closesOnLine)
    }

    // End = continuation after emitting { that follows do or ->
    // Defer the -1 depth adjustment to when the matching } closes
    if (isBlockAfterDoOrArrow && eqContinuation) {
      eqContinuation = false
      deferredCloseAdjust.push(-1)
    }

    // Update paren depth after the line.
    prevParenDepth = parenDepth
    // Reset paren depth when entering a new brace block via lambda arrow (-> {)
    // or when parens are balanced. Don't reset when inside unclosed parens from
    // previous lines (e.g. `( [\n{...}\n]`).
    const isLambdaOpen = opensOnLine > closesOnLine && /->/.test(stripped)
    if (isLambdaOpen) {
      parenDepth = 0
    } else {
      parenDepth = Math.max(0, parenDepth + parenDelta)
    }

    // Check if this line ends with an if(...) and nothing after it.
    // Must be a prefix if (start of line or after else), not a postfix conditional
    // like `(field: value) if(cond)`.
    if (!afterIfElse && opensOnLine <= closesOnLine) {
      if (/^\s*(?:else\s+)?if\s*\([^)]*\)\s*$/.test(stripped)) {
        depthBeforeIfElse = depth - opensOnLine + closesOnLine
        afterIfElse = true
        depth = depthBeforeIfElse + 1
      }
    }

    // Check if line ends with = (assignment, value continues on next lines)
    if (!eqContinuation && /=\s*$/.test(stripped)) {
      eqContinuation = true
      depth++
    }

    // End = continuation after a line ending with , at paren depth 0
    if (eqContinuation && parenDepth === 0 && /,\s*$/.test(stripped)) {
      depth = Math.max(0, depth - 1)
      eqContinuation = false
    }

    // Track if line ends with -> or do for next-line brace handling
    if (/->[\s,]*$/.test(stripped)) prevEndedWithArrow = true
    if (/\bdo\s*$/.test(stripped)) prevEndedWithDo = true
  }

  return result.join('\n')
}

/**
 * Strip string literals from a line for safe pattern matching on code structure.
 */
function stripStrings(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''")
}

/**
 * Count occurrences of bracket chars in a line, ignoring those inside strings/comments.
 */
function countUnquoted(line: string, chars: string[]): number {
  let count = 0
  let inStr: string | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && inStr) { i++; continue }
    if (inStr) {
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue }
    if (ch === '/' && line[i + 1] === '/') break // rest is comment
    if (chars.includes(ch)) count++
  }
  return count
}

/**
 * Main formatting entry point.
 */
export function formatDataWeave(src: string): string {
  const normalized = normalizeWhitespace(src)
  const parts = splitHeaderBody(normalized)

  if (parts) {
    const header = reindent(parts.header)
    const body = reindent(parts.body)
    return header + '\n' + body + '\n'
  }

  // No header/body separator — treat entire thing as body
  return reindent(normalized) + '\n'
}
