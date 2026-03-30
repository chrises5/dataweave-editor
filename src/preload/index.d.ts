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

export interface ElectronAPI {
  execute: (payload: ExecutePayload) => Promise<DwResult>
  onRun: (cb: () => void) => () => void
  openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>
  readFile: (filePath: string) => Promise<string>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
