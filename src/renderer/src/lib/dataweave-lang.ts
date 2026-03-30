// DataWeave Monarch tokenizer definition for Monaco Editor
// Source: https://microsoft.github.io/monaco-editor/monarch-static.html
// Reference: https://github.com/mulesoft-labs/data-weave-tmLanguage
// Reference: https://docs.mulesoft.com/dataweave/latest/dataweave-type-system

import type { languages } from 'monaco-editor'

export const DATAWEAVE_LANGUAGE_ID = 'dataweave'

export const dwLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string'] },
  ],
}

// Keywords: control flow and declarations (token class: 'keyword')
// Per D-04: output and input are in the same keyword token class
const keywords = [
  'if', 'else', 'match', 'case', 'do', 'using', 'default', 'unless',
  'var', 'fun', 'type', 'ns', 'import', 'from', 'output', 'input',
  'and', 'or', 'not', 'as', 'is', 'update', 'annotation', 'private',
]

// Built-in types (token class: 'type.identifier') — per D-02, distinct from keywords
const builtinTypes = [
  'Any', 'Array', 'Binary', 'Boolean', 'CData', 'Comparable',
  'Date', 'DateTime', 'Dictionary', 'Enum', 'Iterator', 'Key',
  'LocalDateTime', 'LocalTime', 'Namespace', 'Nothing', 'Null',
  'Number', 'Object', 'Period', 'Range', 'Regex', 'SimpleType',
  'String', 'Time', 'TimeZone', 'TryResult', 'Type', 'Uri',
]

export const dwMonarchTokens: languages.IMonarchLanguage = {
  keywords,
  builtinTypes,
  defaultToken: 'invalid',
  tokenPostfix: '.dw',

  tokenizer: {
    root: [
      // Version directive line (%dw 2.0)
      [/^%dw\s[\d.]+/, 'keyword.control'],

      // Body separator
      [/^---$/, 'keyword.control'],

      // Whitespace
      [/\s+/, 'white'],

      // Block comments (must come before line comments and operators)
      [/\/\*/, 'comment', '@blockComment'],

      // Line comments
      [/\/\/.*$/, 'comment'],

      // Double-quoted strings with interpolation support
      [/"/, 'string', '@dqString'],

      // Single-quoted strings (no interpolation)
      [/'/, 'string', '@sqString'],

      // Backtick identifiers (escaped names)
      [/`[^`]*`/, 'identifier'],

      // Regex literals: /pattern/ — simple heuristic: not a comment (//) or block comment (/*)
      [/\/(?![/*])([^/\n\\]|\\.)+\//, 'regexp'],

      // Numbers (hex, float, int)
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+\.\d*([eE][+-]?\d+)?/, 'number.float'],
      [/\d+[eE][+-]?\d+/, 'number.float'],
      [/\d+/, 'number'],

      // Operators
      [/[=><!~&|+\-*/%?:]+/, 'operator'],
      [/[.,;]/, 'delimiter'],

      // Brackets
      [/[{}()\[\]]/, '@brackets'],

      // DW selectors (.*, .^, .@, .., .?)
      [/\.\*|\.\^|\.@|\.\.|\.\?/, 'operator'],

      // Identifiers, keywords, types, and constants
      [/[a-zA-Z_$][\w$]*/, {
        cases: {
          '@builtinTypes': 'type.identifier',
          '@keywords': 'keyword',
          'true|false': 'constant.language',
          'null': 'constant.language',
          '@default': 'identifier',
        },
      }],
    ],

    dqString: [
      // String interpolation: $(...)
      [/\$\(/, { token: 'string.escape', next: '@interpolation' }],
      // Simple variable interpolation: $identifier
      [/\$[a-zA-Z_$][\w$]*/, 'string.escape'],
      // Escape sequences
      [/\\[nrtbf\\"']/, 'string.escape'],
      [/\\u[0-9a-fA-F]{4}/, 'string.escape'],
      // End of string
      [/"/, 'string', '@pop'],
      // String content
      [/[^"\\$]+/, 'string'],
    ],

    sqString: [
      [/\\[nrtbf\\'"]/, 'string.escape'],
      [/'/, 'string', '@pop'],
      [/[^'\\]+/, 'string'],
    ],

    interpolation: [
      // Nested parens for complex expressions
      [/\(/, 'string.escape', '@interpolation'],
      [/\)/, 'string.escape', '@pop'],
      // Tokenize the interpolated expression with root rules
      { include: '@root' },
    ],

    blockComment: [
      [/[^/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
}
