export interface DwResult {
  ok: boolean
  output?: string
  error?: string
}

export interface ElectronAPI {
  execute: (script: string, input: string) => Promise<DwResult>
  onRun: (cb: () => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
