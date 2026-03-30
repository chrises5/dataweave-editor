import { app, shell, BrowserWindow, ipcMain, Menu, MenuItem } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { executeDw } from './dw-runner'
import icon from '../../resources/icon.png?asset'

// Register IPC handler before app.whenReady() to avoid race conditions (Pitfall 6)
ipcMain.handle('dw:execute', async (_event, payload: { script: string; input: string }) => {
  return executeDw(payload.script, payload.input)
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
        browserWindow?.webContents.send('shortcut:run')
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
