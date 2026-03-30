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
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  // Multi-session persistence
  getSessions: () => ipcRenderer.invoke('sessions:get'),
  setSessions: (data: Record<string, unknown>) => ipcRenderer.invoke('sessions:set', data),
  clearSessions: () => ipcRenderer.invoke('sessions:clear'),
  // Tab keyboard shortcuts from main process menu
  onTabNew: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('tab:new', listener)
    return (): void => { ipcRenderer.removeListener('tab:new', listener) }
  },
  onTabClose: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('tab:close', listener)
    return (): void => { ipcRenderer.removeListener('tab:close', listener) }
  },
  onTabNext: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('tab:next', listener)
    return (): void => { ipcRenderer.removeListener('tab:next', listener) }
  },
  onTabPrev: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('tab:prev', listener)
    return (): void => { ipcRenderer.removeListener('tab:prev', listener) }
  },
  // Theme persistence
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme: string) => ipcRenderer.invoke('theme:set', theme),
  onThemeToggle: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('theme:toggle', listener)
    return (): void => { ipcRenderer.removeListener('theme:toggle', listener) }
  },
})
