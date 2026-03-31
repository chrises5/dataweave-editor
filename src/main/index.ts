import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { executeDw, type ExecutePayload } from './dw-runner'
import icon from '../../resources/icon.png?asset'
import { Conf } from 'electron-conf/main'

// Multi-session persistence schema
interface PersistedInput {
  id: string
  name: string
  mimeType: string
  content: string
}

interface PersistedSessionData {
  id: string
  name: string
  script: string
  inputs: PersistedInput[]
  panelSizes: number[]
}

interface PersistedMultiSessionStore {
  sessions: PersistedSessionData[]
  activeSessionIndex: number
}

const DEFAULT_MULTI_SESSION: PersistedMultiSessionStore = {
  sessions: [{
    id: crypto.randomUUID(),
    name: 'Session 1',
    script: '%dw 2.0\noutput application/json\n---\npayload',
    inputs: [{ id: '1', name: 'payload', mimeType: 'application/json', content: '{"hello": "world"}' }],
    panelSizes: [],
  }],
  activeSessionIndex: 0,
}

const sessionStore = new Conf<PersistedMultiSessionStore>({
  name: 'session',
  defaults: DEFAULT_MULTI_SESSION,
})

const themeStore = new Conf<{ theme: 'light' | 'dark' }>({
  name: 'theme',
  defaults: { theme: 'light' },
})

// Register IPC handlers before app.whenReady() to avoid race conditions
ipcMain.handle('dw:execute', async (_event, payload: ExecutePayload) => {
  return executeDw(payload)
})

ipcMain.handle('sessions:get', () => {
  try {
    return sessionStore.store
  } catch {
    return DEFAULT_MULTI_SESSION
  }
})

ipcMain.handle('sessions:set', (_e, data: Partial<PersistedMultiSessionStore>) => {
  try {
    if (data.sessions !== undefined) sessionStore.set('sessions', data.sessions)
    if (data.activeSessionIndex !== undefined) sessionStore.set('activeSessionIndex', data.activeSessionIndex)
  } catch {
    // silently ignore write errors
  }
})

ipcMain.handle('sessions:clear', () => {
  try {
    sessionStore.store = DEFAULT_MULTI_SESSION
  } catch {
    // silently ignore
  }
})

ipcMain.handle('theme:get', () => themeStore.get('theme'))

ipcMain.handle('theme:set', (_e, theme: 'light' | 'dark') => {
  themeStore.set('theme', theme)
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Data Files', extensions: ['json', 'xml', 'csv', 'yaml', 'yml', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return result
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  const { readFile } = await import('fs/promises')
  return readFile(filePath, 'utf8')
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    title: 'DataWeave Editor',
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Catch shortcuts before Monaco swallows them
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.meta || input.control
    let handled = true
    if (mod && input.key === 'Enter') {
      mainWindow.webContents.send('shortcut:run')
    } else if (mod && !input.shift && input.key === 't') {
      mainWindow.webContents.send('tab:new')
    } else if (mod && !input.shift && input.key === 'w') {
      mainWindow.webContents.send('tab:close')
    } else if (mod && input.shift && input.key === ']') {
      mainWindow.webContents.send('tab:next')
    } else if (mod && input.shift && input.key === '[') {
      mainWindow.webContents.send('tab:prev')
    } else if (mod && input.shift && input.key === 'D') {
      mainWindow.webContents.send('theme:toggle')
    } else if (mod && !input.shift && input.key >= '1' && input.key <= '9') {
      mainWindow.webContents.send('tab:switch', parseInt(input.key) - 1)
    } else {
      handled = false
    }
    if (handled) event.preventDefault()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Application menu with Edit (clipboard), Run shortcut, and Tabs shortcuts
  const menu = Menu.buildFromTemplate([
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Dark Mode',
          accelerator: 'CommandOrControl+Shift+D',
          click: (_menuItem, browserWindow) => {
            ;(browserWindow as BrowserWindow | null)?.webContents.send('theme:toggle')
          }
        }
      ]
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Execute Script',
          accelerator: 'CommandOrControl+Enter',
          click: (_menuItem, browserWindow) => {
            ;(browserWindow as BrowserWindow | null)?.webContents.send('shortcut:run')
          }
        }
      ]
    },
    {
      label: 'Tabs',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CommandOrControl+T',
          click: (_menuItem, browserWindow) => {
            ;(browserWindow as BrowserWindow | null)?.webContents.send('tab:new')
          }
        },
        {
          label: 'Close Tab',
          accelerator: 'CommandOrControl+W',
          click: (_menuItem, browserWindow) => {
            ;(browserWindow as BrowserWindow | null)?.webContents.send('tab:close')
          }
        },
        {
          label: 'Next Tab',
          accelerator: 'CommandOrControl+Shift+]',
          click: (_menuItem, browserWindow) => {
            ;(browserWindow as BrowserWindow | null)?.webContents.send('tab:next')
          }
        },
        {
          label: 'Previous Tab',
          accelerator: 'CommandOrControl+Shift+[',
          click: (_menuItem, browserWindow) => {
            ;(browserWindow as BrowserWindow | null)?.webContents.send('tab:prev')
          }
        },
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.chrises5.dataweave-editor')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
