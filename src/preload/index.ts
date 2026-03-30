import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  execute: (script: string, input: string) =>
    ipcRenderer.invoke('dw:execute', { script, input }),
  onRun: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('shortcut:run', listener)
    return (): void => {
      ipcRenderer.removeListener('shortcut:run', listener)
    }
  }
})
