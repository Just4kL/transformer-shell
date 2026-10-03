import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { layoutPath, readLayout, writeLayout } from './layoutStore'

// Режим разработки включается только явно: `npm run dev` ставит
// TRANSFORMER_DEV=1. Иначе (в том числе при `npx electron .` после сборки)
// открывается собранный dist/, а не висящий наготове Vite.
const DEV = process.env.TRANSFORMER_DEV === '1'
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
    // иконка окна: в dev лежит рядом с проектом, в сборке — рядом с app.asar.
    // Файл появляется конвертацией assets/icon.svg (см. README/иконка).
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  nativeTheme.themeSource = 'dark'

  // Логи рендерера в stdout: без этого ошибки на стороне интерфейса
  // не видны в терминале вообще.
  win.webContents.on('console-message', (event) => {
    const level = (event as { level?: unknown }).level
    const message = (event as { message?: unknown }).message
    const line = (event as { lineNumber?: unknown }).lineNumber
    if (typeof message !== 'string') return
    const tag = level === 3 ? 'ошибка' : level === 2 ? 'warn' : 'log'
    if (level !== 0 || message.startsWith('[layout]')) {
      console.log(`[renderer:${tag}] ${message}${line ? ` (стр. ${line})` : ''}`)
    }
  })

  win.webContents.on('preload-error', (_e, file, err) => {
    console.error('[preload] не загрузился:', file, err.message)
  })

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

// ── раскладка ──────────────────────────────────────────────────────────────
// Поверхность намеренно узкая: рендерер умеет только «сохранить» и «прочитать».
// Ни произвольных путей, ни файловых операций на волю рендереру не выдаётся.
ipcMain.handle('layout:load', () => {
  try {
    return { ok: true, data: readLayout() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

ipcMain.handle('layout:save', async (_e, state: unknown) => {
  try {
    return await writeLayout(state)
  } catch (err) {
    console.error('[layout] сохранение не удалось:', (err as Error).message)
    return { ok: false, error: (err as Error).message }
  }
})

ipcMain.handle('layout:path', () => layoutPath())

// Снимок окна в PNG: диалог сохранения выбирает пользователь,
// рендерер получает только итог. Никаких произвольных путей наружу.
ipcMain.handle('shot:export-png', async () => {
  try {
    if (!win) return { ok: false, error: 'нет окна' }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Экспорт поля в PNG',
      defaultPath: path.join(app.getPath('pictures'), `transformer-${stamp}.png`),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
    if (canceled || !filePath) return { ok: true, cancelled: true }
    const image = await win.capturePage()
    await fsp.writeFile(filePath, image.toPNG())
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

app.whenReady().then(() => {
  createWindow()
  console.log('[layout] файл раскладки:', layoutPath())
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
