import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  execute: (payload: { script: string; inputs: Array<{ name: string; mimeType: string; content: string | null; filePath: string | null }> }) =>
    ipcRenderer.invoke('dw:execute', payload),
  onRun: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('shortcut:run', listener)
    return (): void => {
      ipcRenderer.removeListener('shortcut:run', listener)
    }
  },
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath)
})
