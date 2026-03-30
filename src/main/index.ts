import { app, shell, BrowserWindow, ipcMain, Menu, MenuItem, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { executeDw, type ExecutePayload } from './dw-runner'
import icon from '../../resources/icon.png?asset'
import { Conf } from 'electron-conf/main'

// Session persistence schema (filePath/fileName intentionally omitted — file-loaded inputs not persisted per D-12)
interface PersistedInput {
  id: string
  name: string
  mimeType: string
  content: string
}

interface SessionState {
  script: string
  inputs: PersistedInput[]
  panelSizes: number[]
}

const DEFAULT_SESSION: SessionState = {
  script: '%dw 2.0\noutput application/json\n---\npayload',
  inputs: [{ id: '1', name: 'payload', mimeType: 'application/json', content: '{"hello": "world"}' }],
  panelSizes: [],
}

const sessionStore = new Conf<SessionState>({
  name: 'session',
  defaults: DEFAULT_SESSION,
})

// Register IPC handlers before app.whenReady() to avoid race conditions
ipcMain.handle('dw:execute', async (_event, payload: ExecutePayload) => {
  return executeDw(payload)
})

ipcMain.handle('store:get', () => {
  try {
    return sessionStore.store
  } catch {
    return DEFAULT_SESSION  // D-14: silently fall back to defaults
  }
})

ipcMain.handle('store:set', (_e, data: Partial<SessionState>) => {
  try {
    for (const [key, value] of Object.entries(data)) {
      sessionStore.set(key as keyof SessionState, value as SessionState[keyof SessionState])
    }
  } catch {
    // D-14: silently ignore write errors
  }
})

ipcMain.handle('store:clear', () => {
  try {
    sessionStore.store = DEFAULT_SESSION  // D-17: reset to defaults
  } catch {
    // silently ignore
  }
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Register Cmd/Ctrl+Enter keyboard shortcut via Menu accelerator
  const menu = new Menu()
  menu.append(
    new MenuItem({
      label: 'Run',
      accelerator: 'CommandOrControl+Enter',
      click: (_menuItem, browserWindow) => {
        ;(browserWindow as BrowserWindow | null)?.webContents.send('shortcut:run')
      }
    })
  )
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
