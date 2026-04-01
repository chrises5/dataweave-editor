// DataWeave Doc-algebra pretty-printer — Stage 3 of the AST-based formatter pipeline
// Converts a DWDocument AST into a formatted string via the Wadler-Lindig algorithm.
//
// Architecture:
//   printDoc(node)  → Doc value (algebraic description of layout)
//   render(doc, w)  → string (Wadler renderer, respects line width w)
//
// Doc algebra:
//   text(s)         — literal text
//   line            — newline+indent in break mode, single space in flat mode
//   softline        — newline+indent in break mode, EMPTY in flat mode
//   hardline        — always newline+indent (for header separators, directives)
//   concat(...)     — sequential composition
//   nest(n, doc)    — increase indent by n for doc
//   group(doc)      — try flat first; if exceeds line width, break

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

// ─── Doc Type ────────────────────────────────────────────────────────────────

export type Doc =
  | string                                    // literal text
  | { kind: 'concat'; parts: Doc[] }
  | { kind: 'nest'; indent: number; doc: Doc }
  | { kind: 'line' }                          // newline+indent OR space when flat
  | { kind: 'softline' }                      // newline+indent OR empty when flat
  | { kind: 'hardline' }                      // always newline (for header directives)
  | { kind: 'group'; doc: Doc }               // try flat first; if too wide, break

// ─── Doc Constructors ────────────────────────────────────────────────────────

export const text = (s: string): Doc => s
export const line: Doc = { kind: 'line' }
export const softline: Doc = { kind: 'softline' }
export const hardline: Doc = { kind: 'hardline' }
export const concat = (...parts: Doc[]): Doc => ({ kind: 'concat', parts })
export const nest = (indent: number, doc: Doc): Doc => ({ kind: 'nest', indent, doc })
export const group = (doc: Doc): Doc => ({ kind: 'group', doc })

// ─── Indent Size ───────────────────────────────────────────────────────────

/** Module-level indent size used by printDoc. Set before each format call. */
let ind = 2

/** Set the indent size for subsequent printDoc calls. */
export function setIndentSize(n: number): void {
  ind = n
}

/** Interleave docs with a separator */
export function join(sep: Doc, docs: Doc[]): Doc {
  if (docs.length === 0) return ''
  if (docs.length === 1) return docs[0]
  const result: Doc[] = []
  for (let i = 0; i < docs.length; i++) {
    if (i > 0) result.push(sep)
    result.push(docs[i])
  }
  return concat(...result)
}

// ─── measureFlat ─────────────────────────────────────────────────────────────

/**
 * Compute total text width of a doc in flat mode.
 * Returns Infinity if the doc contains a hardline (cannot be rendered flat).
 */
export function measureFlat(doc: Doc): number {
  if (typeof doc === 'string') return doc.length
  switch (doc.kind) {
    case 'concat': {
      let total = 0
      for (const part of doc.parts) {
        const m = measureFlat(part)
        if (m === Infinity) return Infinity
        total += m
      }
      return total
    }
    case 'nest':
      return measureFlat(doc.doc)
    case 'line':
      return 1 // space in flat mode
    case 'softline':
      return 0 // empty in flat mode
    case 'hardline':
      return Infinity // cannot be flat
    case 'group':
      return measureFlat(doc.doc)
    default:
      return 0
  }
}

// ─── render ──────────────────────────────────────────────────────────────────

type WorkItem = { indent: number; mode: 'flat' | 'break'; doc: Doc }

/**
 * Wadler-Lindig renderer.
 * Processes a work-list (stack) of {indent, mode, doc} tuples.
 * Groups try flat mode first; if the flat width exceeds (width - col), use break mode.
 */
export function render(doc: Doc, width: number = 80): string {
  let output = ''
  let col = 0
  const stack: WorkItem[] = [{ indent: 0, mode: 'break', doc }]

  while (stack.length > 0) {
    const item = stack.pop()!
    const { indent, mode, doc: d } = item

    if (typeof d === 'string') {
      output += d
      col += d.length
    } else {
      switch (d.kind) {
        case 'concat':
          // Push parts in reverse so the first part is processed first
          for (let i = d.parts.length - 1; i >= 0; i--) {
            stack.push({ indent, mode, doc: d.parts[i] })
          }
          break
        case 'nest':
          stack.push({ indent: indent + d.indent, mode, doc: d.doc })
          break
        case 'line':
          if (mode === 'flat') {
            output += ' '
            col += 1
          } else {
            output += '\n' + ' '.repeat(indent)
            col = indent
          }
          break
        case 'softline':
          if (mode === 'flat') {
            // empty — no output
          } else {
            output += '\n' + ' '.repeat(indent)
            col = indent
          }
          break
        case 'hardline':
          output += '\n' + ' '.repeat(indent)
          col = indent
          break
        case 'group': {
          const flatLen = measureFlat(d.doc)
          if (col + flatLen <= width) {
            stack.push({ indent, mode: 'flat', doc: d.doc })
          } else {
            stack.push({ indent, mode: 'break', doc: d.doc })
          }
          break
        }
      }
    }
  }

  return output
}

// ─── Comment helpers ─────────────────────────────────────────────────────────

function wrapWithComments(node: { leadingComments?: string[]; trailingComments?: string[] }, inner: Doc): Doc {
  const parts: Doc[] = []

  if (node.leadingComments && node.leadingComments.length > 0) {
    for (const c of node.leadingComments) {
      parts.push(text(c))
      parts.push(hardline)
    }
  }

  parts.push(inner)

  if (node.trailingComments && node.trailingComments.length > 0) {
    for (const c of node.trailingComments) {
      parts.push(text(' '))
      parts.push(text(c))
    }
  }

  return parts.length === 1 ? parts[0] : concat(...parts)
}

// ─── printParam ──────────────────────────────────────────────────────────────

function printParam(p: DWParam): Doc {
  let s = p.name
  if (p.typeAnnotation) s += ': ' + p.typeAnnotation
  if (p.defaultValue) s += '=' + p.defaultValue
  return text(s)
}

// ─── printEntry ──────────────────────────────────────────────────────────────

/**
 * Check if a node's terminal (rightmost) expression is a self-indenting block
 * (ObjectExpr, ArrayExpr, DoExpr, IfExpr). Walks through BinaryExpr right
 * branches and Lambda bodies so that `x map (item) -> do { ... }` is correctly
 * detected. IfExpr is included because printIfChain already nests branch bodies.
 */
function isBlockTerminated(node: DWNode): boolean {
  switch (node.kind) {
    case 'ObjectExpr':
    case 'ArrayExpr':
    case 'DoExpr':
    case 'IfExpr':
      return true
    case 'BinaryExpr':
      return isBlockTerminated((node as DWBinaryExpr).right)
    case 'Lambda':
      return isBlockTerminated((node as DWLambda).body)
    default:
      return false
  }
}

function printEntry(entry: DWObjectEntry): Doc {
  // Spread entry: (if(...) key: val else null) — print just the expression in parens
  if (entry.spread) {
    let entryDoc: Doc = concat(text('('), printDoc(entry.key), text(')'))
    if (entry.conditional !== null) {
      entryDoc = concat(entryDoc, text(' if('), printDoc(entry.conditional), text(')'))
    }
    return wrapWithComments(entry, entryDoc)
  }

  const keyDoc: Doc = entry.dynamic
    ? concat(text('('), printDoc(entry.key), text(')'))
    : printDoc(entry.key)

  const valueDoc = printDoc(entry.value)
  // Nest the value for continuation indent on multi-line expressions (like if/else),
  // but NOT for block-terminated expressions (objects, arrays, do blocks) which
  // manage their own indentation — even through binary/lambda chains like `x map (y) -> do { ... }`.
  const needsNest = !isBlockTerminated(entry.value)
  let entryDoc: Doc = concat(keyDoc, text(': '), needsNest ? nest(ind, valueDoc) : valueDoc)

  if (entry.conditional !== null) {
    entryDoc = concat(text('('), entryDoc, text(') if('), printDoc(entry.conditional), text(')'))
  }

  return wrapWithComments(entry, entryDoc)
}

// ─── printCase ───────────────────────────────────────────────────────────────

function printCase(c: DWMatchCase): Doc {
  let caseDoc: Doc
  if (c.guard !== null) {
    caseDoc = concat(
      text('case '),
      printDoc(c.pattern),
      text(' if '),
      printDoc(c.guard),
      text(' -> '),
      printDoc(c.body)
    )
  } else {
    caseDoc = concat(text('case '), printDoc(c.pattern), text(' -> '), printDoc(c.body))
  }
  return wrapWithComments(c, caseDoc)
}

// ─── printIfChain ───────────────────────────────────────────────────────────

/**
 * Print an if / else-if / else chain as a single group.
 * This ensures all branches break consistently — either the whole chain is flat
 * or every branch gets its own line.
 */
/**
 * Print a branch body for parenthesized if/else chains.
 * When the body is EnclosedExpr and forceBreak is true, always break:
 *   if (cond) (
 *     body
 *   ) else (
 *     body
 *   )
 * When forceBreak is false, use softline so it can stay flat: (body)
 * When not parenthesized, use standard indent with line (respects group).
 */
function printBranchBody(body: DWNode, forceBreak: boolean): { prefix: Doc; doc: Doc; suffix: Doc } {
  if (body.kind === 'EnclosedExpr') {
    const inner = (body as DWEnclosedExpr).expr
    const br = forceBreak ? hardline : softline
    return {
      prefix: text(' ('),
      doc: concat(nest(ind, concat(br, printDoc(inner))), br),
      suffix: text(')'),
    }
  }
  return {
    prefix: '',
    doc: nest(ind, concat(line, printDoc(body))),
    suffix: '',
  }
}

function printIfChain(node: DWIfExpr): Doc {
  // Collect all branches: [{cond, body, leadingComments}] + optional finalElse
  interface Branch {
    cond: DWNode
    body: DWNode
    leadingComments: string[]
  }
  const branches: Branch[] = []
  let finalElse: DWNode | null = null

  let current: DWIfExpr | null = node
  let isFirst = true
  while (current !== null) {
    branches.push({
      cond: current.cond,
      body: current.then,
      leadingComments: isFirst ? [] : (current.leadingComments ?? []),
    })
    isFirst = false
    if (current.else_ === null) {
      break
    }
    if (current.else_.kind === 'IfExpr') {
      current = current.else_ as DWIfExpr
    } else {
      finalElse = current.else_
      break
    }
  }

  // Check if ALL branches (including finalElse) use parenthesized bodies.
  // If so, use the paren-inlined layout with forced breaks — this is the
  // idiomatic DataWeave style: if(cond) (\n  value\n) else (\n  value\n)
  const allBodies = [...branches.map(b => b.body), ...(finalElse ? [finalElse] : [])]
  const allParenBranches = allBodies.every(b => b.kind === 'EnclosedExpr')
  const anyParenBranch = allBodies.some(b => b.kind === 'EnclosedExpr')

  // Build the doc as a single group
  const parts: Doc[] = []
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]
    const bb = anyParenBranch ? printBranchBody(b.body, allParenBranches) : null
    if (i === 0) {
      parts.push(text('if ('), printDoc(b.cond), text(')'))
      if (bb) {
        parts.push(bb.prefix, bb.doc, bb.suffix)
      } else {
        parts.push(nest(ind, concat(line, printDoc(b.body))))
      }
    } else {
      // Leading comments go above the else-if line
      if (b.leadingComments.length > 0) {
        for (const c of b.leadingComments) {
          parts.push(hardline, text(c))
        }
      }
      if (bb) {
        parts.push(line, text('else if ('), printDoc(b.cond), text(')'), bb.prefix, bb.doc, bb.suffix)
      } else {
        parts.push(line, text('else if ('), printDoc(b.cond), text(')'))
        parts.push(nest(ind, concat(line, printDoc(b.body))))
      }
    }
  }

  if (finalElse !== null) {
    if (anyParenBranch) {
      const eb = printBranchBody(finalElse, allParenBranches)
      parts.push(line, text('else'), eb.prefix, eb.doc, eb.suffix)
    } else {
      parts.push(line, text('else'), nest(ind, concat(line, printDoc(finalElse))))
    }
  }

  return group(concat(...parts))
}

// ─── printDoc ────────────────────────────────────────────────────────────────

/**
 * Main dispatch function — walks a DWNode and produces a Doc.
 * The switch must be exhaustive over all DWNode kinds.
 */
export function printDoc(node: DWNode): Doc {
  switch (node.kind) {

    // ── Document ────────────────────────────────────────────────────────────
    case 'Document': {
      const n = node as DWDocument
      let inner: Doc

      if (n.header !== null) {
        if (n.hasVersion) {
          // Header with %dw version line
          inner = concat(
            text('%dw 2.0'),
            hardline,
            printDoc(n.header),
            hardline,
            text('---'),
            hardline,
            group(printDoc(n.body))
          )
        } else {
          // Header without %dw version (e.g. starts with "output ...")
          inner = concat(
            printDoc(n.header),
            hardline,
            text('---'),
            hardline,
            group(printDoc(n.body))
          )
        }
      } else if (n.separator) {
        // No header, but source had a --- separator (body-only form with separator)
        inner = concat(
          text('---'),
          hardline,
          group(printDoc(n.body))
        )
      } else {
        // Pure expression, no header or separator
        inner = printDoc(n.body)
      }
      return wrapWithComments(n, inner)
    }

    // ── Header ──────────────────────────────────────────────────────────────
    case 'Header': {
      const n = node as DWHeader
      if (n.directives.length === 0) return ''
      const parts: Doc[] = []
      for (let i = 0; i < n.directives.length; i++) {
        if (i > 0) {
          parts.push(hardline)
          if (n.directives[i].blankLineBefore) {
            parts.push(hardline)
          }
        }
        parts.push(printDoc(n.directives[i]))
      }
      const inner = concat(...parts)
      return wrapWithComments(n, inner)
    }

    // ── VarDirective ────────────────────────────────────────────────────────
    case 'VarDirective': {
      const n = node as DWVarDirective
      const valueDoc = printDoc(n.value)
      let inner: Doc
      if (n.typeAnnotation) {
        inner = concat(
          text('var '), text(n.name), text(': '), text(n.typeAnnotation), text(' = '),
          valueDoc
        )
      } else {
        inner = concat(text('var '), text(n.name), text(' = '), valueDoc)
      }
      return wrapWithComments(n, inner)
    }

    // ── FunDirective ────────────────────────────────────────────────────────
    case 'FunDirective': {
      const n = node as DWFunDirective
      const paramDocs = n.params.map(printParam)
      const inner = concat(
        text('fun '),
        text(n.name),
        text('('),
        join(text(', '), paramDocs),
        text(') = '),
        (n.body.kind === 'DoExpr' || n.body.kind === 'ObjectExpr' || n.body.kind === 'ArrayExpr')
          ? printDoc(n.body) : nest(ind, printDoc(n.body))
      )
      return wrapWithComments(n, inner)
    }

    // ── TypeDirective ───────────────────────────────────────────────────────
    case 'TypeDirective': {
      const n = node as DWTypeDirective
      let inner: Doc
      if (n.entries && n.entries.length > 0) {
        // Structured object type: expand entries over multiple lines
        const entryDocs: Doc[] = n.entries.map((e, i) =>
          concat(
            text(e.key + ': ' + e.type),
            i < n.entries!.length - 1 ? text(',') : ''
          )
        )
        inner = concat(
          text('type '), text(n.name), text(' = '),
          group(concat(
            text('{'),
            nest(ind, concat(hardline, join(hardline, entryDocs))),
            hardline,
            text('}')
          ))
        )
      } else {
        inner = concat(text('type '), text(n.name), text(' = '), text(n.value))
      }
      return wrapWithComments(n, inner)
    }

    // ── NsDirective ─────────────────────────────────────────────────────────
    case 'NsDirective': {
      const n = node as DWNsDirective
      const inner = concat(text('ns '), text(n.prefix), text(' '), text(n.uri))
      return wrapWithComments(n, inner)
    }

    // ── ImportDirective ─────────────────────────────────────────────────────
    case 'ImportDirective': {
      const n = node as DWImportDirective
      const inner = concat(text('import '), text(n.raw))
      return wrapWithComments(n, inner)
    }

    // ── InputDirective ──────────────────────────────────────────────────────
    case 'InputDirective': {
      const n = node as DWInputDirective
      const inner = concat(text('input '), text(n.name), text(' '), text(n.mimeType))
      return wrapWithComments(n, inner)
    }

    // ── OutputDirective ─────────────────────────────────────────────────────
    case 'OutputDirective': {
      const n = node as DWOutputDirective
      let inner: Doc
      if (n.properties.length > 0) {
        inner = concat(text('output '), text(n.mimeType), text(' '), join(text(' '), n.properties.map(text)))
      } else {
        inner = concat(text('output '), text(n.mimeType))
      }
      return wrapWithComments(n, inner)
    }

    // ── IfExpr ──────────────────────────────────────────────────────────────
    case 'IfExpr': {
      const n = node as DWIfExpr
      const inner = printIfChain(n)
      return wrapWithComments(n, inner)
    }

    // ── MatchExpr ───────────────────────────────────────────────────────────
    case 'MatchExpr': {
      const n = node as DWMatchExpr
      const keyword = n.op === 'update' ? 'update' : 'match'
      const caseDocs = n.cases.map(printCase)
      const inner = group(concat(
        printDoc(n.expr),
        text(` ${keyword} {`),
        nest(ind, concat(hardline, join(hardline, caseDocs))),
        hardline,
        text('}')
      ))
      return wrapWithComments(n, inner)
    }

    // ── DoExpr ──────────────────────────────────────────────────────────────
    case 'DoExpr': {
      const n = node as DWDoExpr
      const hasDirectives = n.header.directives.length > 0
      const bodyParts: Doc[] = []
      if (hasDirectives) {
        bodyParts.push(hardline, printDoc(n.header), hardline, text('---'))
      }
      bodyParts.push(hardline, printDoc(n.body))
      const inner = concat(
        text('do {'),
        nest(ind, concat(...bodyParts)),
        hardline,
        text('}')
      )
      return wrapWithComments(n, inner)
    }

    // ── UsingExpr ───────────────────────────────────────────────────────────
    case 'UsingExpr': {
      const n = node as DWUsingExpr
      const bindingDocs = n.bindings.map((b) =>
        concat(text(b.name), text(' = '), printDoc(b.value))
      )
      const inner = concat(
        text('using ('),
        join(text(', '), bindingDocs),
        text(') '),
        printDoc(n.body)
      )
      return wrapWithComments(n, inner)
    }

    // ── Lambda ──────────────────────────────────────────────────────────────
    case 'Lambda': {
      const n = node as DWLambda
      const paramDocs = n.params.map(printParam)
      const inner = concat(
        text('('),
        join(text(', '), paramDocs),
        text(') -> '),
        printDoc(n.body)
      )
      return wrapWithComments(n, inner)
    }

    // ── BinaryExpr ──────────────────────────────────────────────────────────
    case 'BinaryExpr': {
      const n = node as DWBinaryExpr
      // Only these operators allow line breaks between left and right:
      const breakableOps = new Set([
        '++', '--', '+', '-', '*', '/',
        'or', 'and',
        '==', '!=', '~=', '<', '<=', '>', '>=',
      ])
      if (!breakableOps.has(n.op)) {
        const inner = concat(
          printDoc(n.left),
          text(' ' + n.op + ' '),
          printDoc(n.right)
        )
        return wrapWithComments(n, inner)
      }
      // Break at the operator: operator stays at end of left line,
      // right operand goes on next line indented.
      // flat:  left ++ right
      // break: left ++\n  right
      // Skip nest for block-like right operands that manage their own indentation.
      const rightDoc = printDoc(n.right)
      const rightSelfIndenting = n.right.kind === 'DoExpr' || n.right.kind === 'ObjectExpr' || n.right.kind === 'ArrayExpr'
      const inner = group(concat(
        printDoc(n.left),
        text(' ' + n.op),
        rightSelfIndenting
          ? concat(text(' '), rightDoc)
          : nest(ind, concat(line, rightDoc))
      ))
      return wrapWithComments(n, inner)
    }

    // ── UnaryExpr ───────────────────────────────────────────────────────────
    case 'UnaryExpr': {
      const n = node as DWUnaryExpr
      // "not " has a space, other unary ops (-,!) don't
      const opStr = n.op === 'not' ? 'not ' : n.op
      const inner = concat(text(opStr), printDoc(n.operand))
      return wrapWithComments(n, inner)
    }

    // ── SelectorExpr ────────────────────────────────────────────────────────
    case 'SelectorExpr': {
      const n = node as DWSelectorExpr
      let inner: Doc
      switch (n.selectorKind) {
        case 'dot':
          inner = concat(printDoc(n.expr), text('.'), text(n.selector))
          break
        case 'dotdot':
          inner = concat(printDoc(n.expr), text('..'), text(n.selector))
          break
        case 'bracket':
          // bracket access: expr[index]
          if (n.indexExpr) {
            inner = concat(printDoc(n.expr), text('['), printDoc(n.indexExpr), text(']'))
          } else {
            inner = concat(printDoc(n.expr), text('['), text(n.selector), text(']'))
          }
          break
        case 'filter':
          inner = concat(printDoc(n.expr), text('[?('), text(n.selector), text(')]'))
          break
        case 'metadata':
          inner = concat(printDoc(n.expr), text('.@'), text(n.selector))
          break
        default:
          inner = concat(printDoc(n.expr), text('.'), text(n.selector))
      }
      return wrapWithComments(n, inner)
    }

    // ── FunctionCall ────────────────────────────────────────────────────────
    case 'FunctionCall': {
      const n = node as DWFunctionCall
      const argDocs = n.args.map(printDoc)
      // Never break function args — wrap in group to force flat mode for
      // nested objects/arrays so they stay on one line inside args.
      const inner = group(concat(
        printDoc(n.callee),
        text('('),
        join(text(', '), argDocs),
        text(')')
      ))
      return wrapWithComments(n, inner)
    }

    // ── ObjectExpr ──────────────────────────────────────────────────────────
    case 'ObjectExpr': {
      const n = node as DWObjectExpr
      let inner: Doc
      if (n.entries.length === 0) {
        inner = text('{}')
      } else {
        const entryDocs = n.entries.map(printEntry)
        // Objects use line (space in flat, newline in break) without their own
        // group — they inherit the parent's break mode. This ensures nested
        // objects inside a breaking parent also expand consistently.
        // Objects only stay flat when inside a flat context (e.g. function args).
        inner = concat(
          text('{'),
          nest(ind, concat(line, join(concat(text(','), line), entryDocs))),
          line,
          text('}')
        )
      }
      return wrapWithComments(n, inner)
    }

    // ── ArrayExpr ───────────────────────────────────────────────────────────
    case 'ArrayExpr': {
      const n = node as DWArrayExpr
      let inner: Doc
      if (n.elements.length === 0) {
        inner = text('[]')
      } else {
        const elemDocs = n.elements.map(printDoc)
        // Use softline so [1, 2, 3] stays tight in flat mode
        inner = group(concat(
          text('['),
          nest(ind, concat(softline, join(concat(text(','), line), elemDocs))),
          softline,
          text(']')
        ))
      }
      return wrapWithComments(n, inner)
    }

    // ── EnclosedExpr ────────────────────────────────────────────────────────
    case 'EnclosedExpr': {
      const n = node as DWEnclosedExpr
      const inner = concat(text('('), printDoc(n.expr), text(')'))
      return wrapWithComments(n, inner)
    }

    // ── Literal ─────────────────────────────────────────────────────────────
    case 'Literal': {
      const n = node as DWLiteral
      return wrapWithComments(n, text(n.value))
    }

    // ── Identifier ──────────────────────────────────────────────────────────
    case 'Identifier': {
      const n = node as DWIdentifier
      return wrapWithComments(n, text(n.name))
    }

    // ── ConditionalExpr (postfix if) ─────────────────────────────────────
    case 'ConditionalExpr': {
      const n = node as DWConditionalExpr
      const inner = concat(
        printDoc(n.expr),
        text(' if '),
        printDoc(n.condition)
      )
      return wrapWithComments(n, inner)
    }

    default: {
      // TypeScript exhaustiveness check — if we reach here, a node kind is missing
      const _exhaustive: never = node
      return text('')
    }
  }
}
