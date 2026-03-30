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

export interface PersistedInput {
  id: string
  name: string
  mimeType: string
  content: string
}

export interface PersistedSessionData {
  id: string
  name: string
  script: string
  inputs: PersistedInput[]
  panelSizes: number[]
}

export interface LiveSessionData extends Omit<PersistedSessionData, 'inputs'> {
  // inputs uses InputSlot (with filePath/fileName) at runtime; PersistedInput at rest
  inputs: InputSlot[]
  // Runtime-only fields — NOT persisted (D-08)
  output: string
  error: string | null
  running: boolean
  logs: string[]
  logPanelOpen: boolean
}

export interface PersistedMultiSessionStore {
  sessions: PersistedSessionData[]
  activeSessionIndex: number
}
