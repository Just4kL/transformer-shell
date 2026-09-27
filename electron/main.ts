import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import * as path from 'node:path'

const DEV = process.env.TRANSFORMER_DEV === '1' || !app.isPackaged
const DEV_URL = 'http://localhost:5273'
const RENDERER_DIR = path.join(__dirname, '..', 'dist')

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false, // своя панель окна, полностью подчинённая двойной разметке
    resizable: true,
    maximizable: true,
    backgroundColor: '#0a0c0f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  nativeTheme.themeSource = 'dark'

  win.once('ready-to-show', () => win?.show())

  const notifyMaximize = () => {
    win?.webContents.send('win:maximized', Boolean(win?.isMaximized()))
  }
  win.on('maximize', notifyMaximize)
  win.on('unmaximize', notifyMaximize)
  win.on('closed', () => {
    win = null
  })

  if (DEV) {
    void win.loadURL(DEV_URL)
  } else {
    void win.loadFile(path.join(RENDERER_DIR, 'index.html'))
  }
}

// Свои кнопки окна: оболочка рисует их сама, в общей сетке.
ipcMain.on('win:minimize', () => win?.minimize())
ipcMain.on('win:toggle-maximize', () => {
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('win:close', () => win?.close())

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Внешние ссылки — в системный браузер, внутри окна ничего не открываем.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
})
