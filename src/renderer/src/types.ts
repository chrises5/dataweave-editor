export interface InputSlot {
  id: string
  name: string          // e.g. 'payload', 'attributes', 'myVar'
  mimeType: string      // e.g. 'application/json'
  content: string       // typed text (empty string when filePath is set)
  filePath?: string     // absolute path to file on disk (overrides content at execution)
  fileName?: string     // display-only basename
}

export interface ExecuteInputSlot {
  name: string
  mimeType: string
  content: string | null   // null when filePath provided
  filePath: string | null  // null when content provided
}

export interface ExecutePayload {
  script: string
  inputs: ExecuteInputSlot[]
}

export const MIME_OPTIONS = [
  { value: 'application/json', label: 'JSON' },
  { value: 'application/xml', label: 'XML' },
  { value: 'text/csv', label: 'CSV' },
  { value: 'application/yaml', label: 'YAML' },
  { value: 'text/plain', label: 'Text' },
  { value: 'application/x-www-form-urlencoded', label: 'URL-encoded' },
  { value: 'multipart/form-data', label: 'Multipart' },
] as const
