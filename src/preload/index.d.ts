export interface DwResult {
  ok: boolean
  output?: string
  logs?: string[]
  error?: string
}

export interface ExecuteInputSlot {
  name: string
  mimeType: string
  content: string | null
  filePath: string | null
}

export interface ExecutePayload {
  script: string
  inputs: ExecuteInputSlot[]
}

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

export interface PersistedMultiSessionStore {
  sessions: PersistedSessionData[]
  activeSessionIndex: number
}

export interface DwDiagnostic {
  message: string
  line: number
  column: number
}

export interface DwValidateResult {
  ok: boolean
  diagnostics: DwDiagnostic[]
}

export interface ElectronAPI {
  execute: (payload: ExecutePayload) => Promise<DwResult>
  validate: (script: string, inputNames: string[]) => Promise<DwValidateResult>
  onRun: (cb: () => void) => () => void
  openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>
  readFile: (filePath: string) => Promise<string>
  // Multi-session persistence (replaces getSession/setSession/clearSession)
  getSessions: () => Promise<PersistedMultiSessionStore>
  setSessions: (data: Partial<PersistedMultiSessionStore>) => Promise<void>
  clearSessions: () => Promise<void>
  // Tab keyboard shortcuts from main process menu
  onTabNew: (cb: () => void) => () => void
  onTabClose: (cb: () => void) => () => void
  onTabNext: (cb: () => void) => () => void
  onTabPrev: (cb: () => void) => () => void
  onTabSwitch: (cb: (index: number) => void) => () => void
  // Theme persistence
  getTheme: () => Promise<'light' | 'dark'>
  setTheme: (theme: 'light' | 'dark') => Promise<void>
  onThemeToggle: (cb: () => void) => () => void
  // Format shortcut
  onFormat: (cb: () => void) => () => void
  // Settings persistence (D-18)
  getSettings: () => Promise<{ fontSize: number; tabSize: number; insertSpaces: boolean; autoRunDelay: number }>
  setSettings: (patch: Record<string, unknown>) => Promise<void>
  // Font size shortcuts (D-15)
  onFontSizeChange: (cb: (action: string) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
