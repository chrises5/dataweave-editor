// DataWeave Monarch tokenizer definition for Monaco Editor
// Source: https://microsoft.github.io/monaco-editor/monarch-static.html
// Reference: https://github.com/mulesoft-labs/data-weave-tmLanguage
// Reference: https://docs.mulesoft.com/dataweave/latest/dataweave-type-system

import type { languages, editor, Position, CancellationToken } from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'

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

// --- Autocomplete ---

interface DwFunction {
  name: string
  detail: string
  doc?: string
  snippet?: string
}

const dwCoreFunctions: DwFunction[] = [
  // dw::Core
  { name: 'sizeOf', detail: '(value: Array|Object|String) => Number', doc: 'Returns the number of elements.' },
  { name: 'typeOf', detail: '(value: Any) => Type', doc: 'Returns the type of a value.' },
  { name: 'isEmpty', detail: '(value: Any) => Boolean', doc: 'Returns true if the value is empty.' },
  { name: 'log', detail: '(prefix: String, value: T) => T', doc: 'Logs the value and returns it.', snippet: 'log("$1", $2)' },
  { name: 'read', detail: '(value: String|Binary, mimeType: String) => Any', doc: 'Reads a string as the given MIME type.', snippet: 'read($1, "$2")' },
  { name: 'write', detail: '(value: Any, mimeType: String) => String|Binary', doc: 'Writes a value as the given MIME type.', snippet: 'write($1, "$2")' },
  { name: 'flatten', detail: '(value: Array<Array>) => Array', doc: 'Flattens nested arrays.' },
  { name: 'distinctBy', detail: '(items: Array, criteria: (item) => Any) => Array', doc: 'Returns unique elements.', snippet: 'distinctBy($1, (item) -> $2)' },
  { name: 'groupBy', detail: '(items: Array, criteria: (item) => Any) => Object', doc: 'Groups array elements.', snippet: 'groupBy($1, (item) -> $2)' },
  { name: 'orderBy', detail: '(items: Array, criteria: (item) => Comparable) => Array', doc: 'Orders array elements.', snippet: 'orderBy($1, (item) -> $2)' },
  { name: 'filter', detail: '(items: Array, criteria: (item) => Boolean) => Array', doc: 'Filters array elements.', snippet: 'filter $1 ((item) -> $2)' },
  { name: 'map', detail: '(items: Array, mapper: (item, index) => Any) => Array', doc: 'Transforms each element.', snippet: 'map $1 ((item, index) -> $2)' },
  { name: 'mapObject', detail: '(obj: Object, mapper: (value, key, index) => Object) => Object', doc: 'Transforms each key-value pair.', snippet: 'mapObject $1 ((value, key) -> $2)' },
  { name: 'pluck', detail: '(obj: Object, mapper: (value, key, index) => Any) => Array', doc: 'Maps object to array.', snippet: 'pluck $1 ((value, key) -> $2)' },
  { name: 'reduce', detail: '(items: Array, reducer: (item, acc) => Any) => Any', doc: 'Reduces array to a single value.', snippet: 'reduce $1 ((item, acc) -> $2)' },
  { name: 'joinBy', detail: '(items: Array, separator: String) => String', doc: 'Joins array elements with separator.', snippet: 'joinBy($1, "$2")' },
  { name: 'splitBy', detail: '(text: String, separator: String|Regex) => Array<String>', doc: 'Splits string by separator.', snippet: 'splitBy($1, "$2")' },
  { name: 'contains', detail: '(items: Array|String, value: Any) => Boolean', doc: 'Checks if value is contained.' },
  { name: 'startsWith', detail: '(text: String, prefix: String) => Boolean', doc: 'Checks if string starts with prefix.' },
  { name: 'endsWith', detail: '(text: String, suffix: String) => Boolean', doc: 'Checks if string ends with suffix.' },
  { name: 'replace', detail: '(text: String, target: String|Regex, replacement: String) => String', doc: 'Replaces occurrences.', snippet: 'replace $1 with $2' },
  { name: 'match', detail: '(text: String, regex: Regex) => Array<String>', doc: 'Returns regex matches.' },
  { name: 'matches', detail: '(text: String, regex: Regex) => Boolean', doc: 'Tests if string matches regex.' },
  { name: 'upper', detail: '(text: String) => String', doc: 'Converts to uppercase.' },
  { name: 'lower', detail: '(text: String) => String', doc: 'Converts to lowercase.' },
  { name: 'trim', detail: '(text: String) => String', doc: 'Removes leading and trailing whitespace.' },
  { name: 'abs', detail: '(value: Number) => Number', doc: 'Returns absolute value.' },
  { name: 'ceil', detail: '(value: Number) => Number', doc: 'Rounds up.' },
  { name: 'floor', detail: '(value: Number) => Number', doc: 'Rounds down.' },
  { name: 'round', detail: '(value: Number) => Number', doc: 'Rounds to nearest integer.' },
  { name: 'min', detail: '(values: Array<Comparable>) => Comparable', doc: 'Returns the minimum value.' },
  { name: 'max', detail: '(values: Array<Comparable>) => Comparable', doc: 'Returns the maximum value.' },
  { name: 'sum', detail: '(values: Array<Number>) => Number', doc: 'Returns the sum.' },
  { name: 'avg', detail: '(values: Array<Number>) => Number', doc: 'Returns the average.' },
  { name: 'now', detail: '() => DateTime', doc: 'Returns the current date and time.' },
  { name: 'uuid', detail: '() => String', doc: 'Generates a random UUID.' },
  { name: 'randomInt', detail: '(max: Number) => Number', doc: 'Returns a random integer.' },
  { name: 'isBlank', detail: '(text: String) => Boolean', doc: 'Returns true if string is blank.' },
  { name: 'isDecimal', detail: '(value: Number) => Boolean', doc: 'Returns true if value is decimal.' },
  { name: 'isInteger', detail: '(value: Number) => Boolean', doc: 'Returns true if value is integer.' },
  { name: 'isEven', detail: '(value: Number) => Boolean', doc: 'Returns true if value is even.' },
  { name: 'isOdd', detail: '(value: Number) => Boolean', doc: 'Returns true if value is odd.' },
  { name: 'isLeapYear', detail: '(value: DateTime|Date) => Boolean', doc: 'Returns true if the year is a leap year.' },
  { name: 'entriesOf', detail: '(obj: Object) => Array<{key, value, attributes}>', doc: 'Returns key-value-attribute entries.' },
  { name: 'keysOf', detail: '(obj: Object) => Array<Key>', doc: 'Returns the keys of an object.' },
  { name: 'valuesOf', detail: '(obj: Object) => Array<Any>', doc: 'Returns the values of an object.' },
  { name: 'namesOf', detail: '(obj: Object) => Array<String>', doc: 'Returns key names as strings.' },
  { name: 'sizeof', detail: '(value: Array|Object|String) => Number', doc: 'Alias for sizeOf.' },
]

const dwStringsFunctions: DwFunction[] = [
  { name: 'capitalize', detail: '(text: String) => String', doc: 'Capitalizes each word.' },
  { name: 'camelize', detail: '(text: String) => String', doc: 'Converts to camelCase.' },
  { name: 'dasherize', detail: '(text: String) => String', doc: 'Converts to dash-case.' },
  { name: 'underscore', detail: '(text: String) => String', doc: 'Converts to snake_case.' },
  { name: 'ordinalize', detail: '(n: Number) => String', doc: 'Converts number to ordinal string (1st, 2nd...).' },
  { name: 'pluralize', detail: '(text: String) => String', doc: 'Pluralizes a word.' },
  { name: 'singularize', detail: '(text: String) => String', doc: 'Singularizes a word.' },
  { name: 'substringAfter', detail: '(text: String, separator: String) => String', doc: 'Returns part after first separator.' },
  { name: 'substringAfterLast', detail: '(text: String, separator: String) => String', doc: 'Returns part after last separator.' },
  { name: 'substringBefore', detail: '(text: String, separator: String) => String', doc: 'Returns part before first separator.' },
  { name: 'substringBeforeLast', detail: '(text: String, separator: String) => String', doc: 'Returns part before last separator.' },
  { name: 'leftPad', detail: '(text: String, size: Number, padChar?: String) => String', doc: 'Pads string on the left.' },
  { name: 'rightPad', detail: '(text: String, size: Number, padChar?: String) => String', doc: 'Pads string on the right.' },
  { name: 'repeat', detail: '(text: String, times: Number) => String', doc: 'Repeats a string.' },
  { name: 'charCode', detail: '(char: String) => Number', doc: 'Returns the character code.' },
  { name: 'charCodeAt', detail: '(text: String, index: Number) => Number', doc: 'Returns char code at index.' },
  { name: 'fromCharCode', detail: '(code: Number) => String', doc: 'Creates string from char code.' },
  { name: 'isAlpha', detail: '(text: String) => Boolean', doc: 'Returns true if string is alphabetic.' },
  { name: 'isAlphanumeric', detail: '(text: String) => Boolean', doc: 'Returns true if string is alphanumeric.' },
  { name: 'isNumeric', detail: '(text: String) => Boolean', doc: 'Returns true if string is numeric.' },
  { name: 'isLowerCase', detail: '(text: String) => Boolean', doc: 'Returns true if string is lowercase.' },
  { name: 'isUpperCase', detail: '(text: String) => Boolean', doc: 'Returns true if string is uppercase.' },
  { name: 'isWhitespace', detail: '(text: String) => Boolean', doc: 'Returns true if string is only whitespace.' },
  { name: 'withMaxSize', detail: '(text: String, maxLength: Number) => String', doc: 'Truncates string to max length.' },
]

const dwURLFunctions: DwFunction[] = [
  { name: 'encodeURI', detail: '(text: String) => String', doc: 'Encodes a URI.' },
  { name: 'encodeURIComponent', detail: '(text: String) => String', doc: 'Encodes a URI component.' },
  { name: 'decodeURI', detail: '(text: String) => String', doc: 'Decodes a URI.' },
  { name: 'decodeURIComponent', detail: '(text: String) => String', doc: 'Decodes a URI component.' },
  { name: 'parseURI', detail: '(uri: String) => URI', doc: 'Parses a URI string into its parts.' },
]

const dwArraysFunctions: DwFunction[] = [
  { name: 'countBy', detail: '(items: Array, criteria: (item) => Boolean) => Number', doc: 'Counts matching elements.' },
  { name: 'divideBy', detail: '(items: Array, size: Number) => Array<Array>', doc: 'Divides into sub-arrays of given size.' },
  { name: 'drop', detail: '(items: Array, count: Number) => Array', doc: 'Drops first N elements.' },
  { name: 'dropWhile', detail: '(items: Array, criteria: (item) => Boolean) => Array', doc: 'Drops elements while condition is true.' },
  { name: 'every', detail: '(items: Array, criteria: (item) => Boolean) => Boolean', doc: 'Returns true if all elements match.' },
  { name: 'some', detail: '(items: Array, criteria: (item) => Boolean) => Boolean', doc: 'Returns true if any element matches.' },
  { name: 'indexOf', detail: '(items: Array, value: Any) => Number', doc: 'Returns index of first occurrence.' },
  { name: 'lastIndexOf', detail: '(items: Array, value: Any) => Number', doc: 'Returns index of last occurrence.' },
  { name: 'join', detail: '(left: Array, right: Array, criteria: (l, r) => Boolean) => Array<{l, r}>', doc: 'Joins two arrays.', snippet: 'join($1, $2, (l, r) -> $3)' },
  { name: 'leftJoin', detail: '(left: Array, right: Array, criteria: (l, r) => Boolean) => Array', doc: 'Left joins two arrays.', snippet: 'leftJoin($1, $2, (l, r) -> $3)' },
  { name: 'outerJoin', detail: '(left: Array, right: Array, criteria: (l, r) => Boolean) => Array', doc: 'Outer joins two arrays.', snippet: 'outerJoin($1, $2, (l, r) -> $3)' },
  { name: 'partition', detail: '(items: Array, criteria: (item) => Boolean) => {success, failure}', doc: 'Partitions array into two groups.' },
  { name: 'slice', detail: '(items: Array, from: Number, until: Number) => Array', doc: 'Returns a slice of the array.' },
  { name: 'take', detail: '(items: Array, count: Number) => Array', doc: 'Takes first N elements.' },
  { name: 'takeWhile', detail: '(items: Array, criteria: (item) => Boolean) => Array', doc: 'Takes elements while condition is true.' },
]

const dwObjectsFunctions: DwFunction[] = [
  { name: 'mergeWith', detail: '(source: Object, target: Object) => Object', doc: 'Merges two objects (target wins on conflicts).' },
  { name: 'filterObject', detail: '(obj: Object, criteria: (value, key) => Boolean) => Object', doc: 'Filters object key-value pairs.' },
]

const allFunctions = [
  ...dwCoreFunctions,
  ...dwStringsFunctions,
  ...dwURLFunctions,
  ...dwArraysFunctions,
  ...dwObjectsFunctions,
]

const dwSnippets = [
  { label: '%dw 2.0 header', insertText: '%dw 2.0\noutput application/json\n---\n$0', doc: 'DataWeave script header' },
  { label: 'import from', insertText: 'import ${1:*} from ${2:dw::core::Strings}', doc: 'Import module' },
  { label: 'fun', insertText: 'fun ${1:name}(${2:param}) = $0', doc: 'Function declaration' },
  { label: 'var', insertText: 'var ${1:name} = $0', doc: 'Variable declaration' },
  { label: 'if else', insertText: 'if ($1)\n\t$2\nelse\n\t$3', doc: 'Conditional expression' },
  { label: 'do block', insertText: 'do {\n\tvar ${1:x} = $2\n\t---\n\t$0\n}', doc: 'Scoped do block' },
  { label: 'match case', insertText: '$1 match {\n\tcase ${2:value} -> $3\n\telse -> $0\n}', doc: 'Pattern matching' },
  { label: 'map lambda', insertText: 'map ((${1:item}, ${2:index}) -> $0)', doc: 'Map with lambda' },
  { label: 'filter lambda', insertText: 'filter ((${1:item}) -> $0)', doc: 'Filter with lambda' },
  { label: 'reduce lambda', insertText: 'reduce ((${1:item}, ${2:acc}) -> $0)', doc: 'Reduce with lambda' },
  { label: 'mapObject lambda', insertText: 'mapObject ((${1:value}, ${2:key}) -> {\n\t($2): $0\n})', doc: 'MapObject with lambda' },
  { label: 'pluck lambda', insertText: 'pluck ((${1:value}, ${2:key}) -> $0)', doc: 'Pluck with lambda' },
  { label: 'groupBy lambda', insertText: 'groupBy ((${1:item}) -> $0)', doc: 'GroupBy with lambda' },
  { label: 'orderBy lambda', insertText: 'orderBy ((${1:item}) -> $0)', doc: 'OrderBy with lambda' },
  { label: 'distinctBy lambda', insertText: 'distinctBy ((${1:item}) -> $0)', doc: 'DistinctBy with lambda' },
  { label: 'output json', insertText: 'output application/json', doc: 'JSON output directive' },
  { label: 'output xml', insertText: 'output application/xml', doc: 'XML output directive' },
  { label: 'output csv', insertText: 'output text/csv', doc: 'CSV output directive' },
  { label: 'output java', insertText: 'output application/java', doc: 'Java output directive' },
]

export function registerDwCompletionProvider(monaco: Monaco): void {
  monaco.languages.registerCompletionItemProvider(DATAWEAVE_LANGUAGE_ID, {
    triggerCharacters: ['.', ':', ' '],
    provideCompletionItems(
      model: editor.ITextModel,
      position: Position,
      _context: languages.CompletionContext,
      _token: CancellationToken
    ): languages.ProviderResult<languages.CompletionList> {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const suggestions: languages.CompletionItem[] = []

      // Functions
      for (const fn of allFunctions) {
        suggestions.push({
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: fn.detail,
          documentation: fn.doc,
          insertText: fn.snippet ?? fn.name,
          insertTextRules: fn.snippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range,
        })
      }

      // Keywords
      for (const kw of keywords) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        })
      }

      // Types
      for (const t of builtinTypes) {
        suggestions.push({
          label: t,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: t,
          range,
        })
      }

      // Snippets
      for (const snip of dwSnippets) {
        suggestions.push({
          label: snip.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          documentation: snip.doc,
          insertText: snip.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })
      }

      return { suggestions }
    },
  })
}
