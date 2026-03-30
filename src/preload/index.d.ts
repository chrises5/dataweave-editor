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

export interface ElectronAPI {
  execute: (payload: ExecutePayload) => Promise<DwResult>
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
  // Theme persistence
  getTheme: () => Promise<'light' | 'dark'>
  setTheme: (theme: 'light' | 'dark') => Promise<void>
  onThemeToggle: (cb: () => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
