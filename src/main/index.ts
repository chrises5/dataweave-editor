import { app, shell, BrowserWindow, ipcMain, Menu, MenuItem, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { executeDw, type ExecutePayload } from './dw-runner'
import icon from '../../resources/icon.png?asset'

// Register IPC handlers before app.whenReady() to avoid race conditions
ipcMain.handle('dw:execute', async (_event, payload: ExecutePayload) => {
  return executeDw(payload)
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
