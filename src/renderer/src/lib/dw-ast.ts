// DataWeave AST node type definitions
// Discriminated union types for the recursive-descent parser (Plan 02)
// and pretty-printer (Plan 03).
//
// Every node interface has a `kind` string literal field for exhaustive
// switch coverage in the printer.
//
// Comment preservation: every node carries optional leadingComments and
// trailingComments arrays so the printer can re-emit comments verbatim.

// ─── Sub-structures (not in DWNode union) ────────────────────────────────────

export interface DWParam {
  kind: 'Param'
  name: string
  typeAnnotation: string | null
  defaultValue?: string | null
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWObjectEntry {
  kind: 'ObjectEntry'
  key: DWNode
  value: DWNode
  conditional: DWNode | null
  dynamic: boolean
  spread?: boolean
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWMatchCase {
  kind: 'MatchCase'
  pattern: DWNode
  guard: DWNode | null
  body: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

// ─── Node interfaces ──────────────────────────────────────────────────────────

export interface DWDocument {
  kind: 'Document'
  header: DWHeader | null
  separator: boolean
  body: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWHeader {
  kind: 'Header'
  directives: DWNode[]
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWVarDirective {
  kind: 'VarDirective'
  name: string
  typeAnnotation: string | null
  value: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWFunDirective {
  kind: 'FunDirective'
  name: string
  params: DWParam[]
  body: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

/** Type body stored as raw string for Phase 8 — full type parsing is deferred */
export interface DWTypeDirective {
  kind: 'TypeDirective'
  name: string
  value: string
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWNsDirective {
  kind: 'NsDirective'
  prefix: string
  uri: string
  leadingComments?: string[]
  trailingComments?: string[]
}

/** Import text stored as raw string for Phase 8 */
export interface DWImportDirective {
  kind: 'ImportDirective'
  raw: string
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWInputDirective {
  kind: 'InputDirective'
  name: string
  mimeType: string
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWOutputDirective {
  kind: 'OutputDirective'
  mimeType: string
  properties: string[]
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWIfExpr {
  kind: 'IfExpr'
  cond: DWNode
  then: DWNode
  else_: DWNode | null
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWMatchExpr {
  kind: 'MatchExpr'
  expr: DWNode
  cases: DWMatchCase[]
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWDoExpr {
  kind: 'DoExpr'
  header: DWHeader
  body: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWUsingExpr {
  kind: 'UsingExpr'
  bindings: { name: string; value: DWNode }[]
  body: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWLambda {
  kind: 'Lambda'
  params: DWParam[]
  body: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWBinaryExpr {
  kind: 'BinaryExpr'
  op: string
  left: DWNode
  right: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWUnaryExpr {
  kind: 'UnaryExpr'
  op: string
  operand: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWSelectorExpr {
  kind: 'SelectorExpr'
  expr: DWNode
  selector: string
  selectorKind: 'dot' | 'dotdot' | 'bracket' | 'filter' | 'metadata'
  indexExpr?: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWFunctionCall {
  kind: 'FunctionCall'
  callee: DWNode
  args: DWNode[]
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWObjectExpr {
  kind: 'ObjectExpr'
  entries: DWObjectEntry[]
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWArrayExpr {
  kind: 'ArrayExpr'
  elements: DWNode[]
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWEnclosedExpr {
  kind: 'EnclosedExpr'
  expr: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWLiteral {
  kind: 'Literal'
  value: string
  literalType: 'string' | 'number' | 'boolean' | 'null' | 'regex'
  leadingComments?: string[]
  trailingComments?: string[]
}

export interface DWIdentifier {
  kind: 'Identifier'
  name: string
  leadingComments?: string[]
  trailingComments?: string[]
}

/** Postfix conditional — `expr if condition` */
export interface DWConditionalExpr {
  kind: 'ConditionalExpr'
  expr: DWNode
  condition: DWNode
  leadingComments?: string[]
  trailingComments?: string[]
}

// ─── The DWNode union ─────────────────────────────────────────────────────────

export type DWNode =
  | DWDocument
  | DWHeader
  | DWVarDirective
  | DWFunDirective
  | DWTypeDirective
  | DWNsDirective
  | DWImportDirective
  | DWInputDirective
  | DWOutputDirective
  | DWIfExpr
  | DWMatchExpr
  | DWDoExpr
  | DWUsingExpr
  | DWLambda
  | DWBinaryExpr
  | DWUnaryExpr
  | DWSelectorExpr
  | DWFunctionCall
  | DWObjectExpr
  | DWArrayExpr
  | DWEnclosedExpr
  | DWLiteral
  | DWIdentifier
  | DWConditionalExpr
