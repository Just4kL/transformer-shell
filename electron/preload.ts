import { contextBridge, ipcRenderer } from 'electron'

/**
 * Узкий мост между рендерером и главным процессом.
 *
 * Здесь нет ничего «общего назначения»: ни fetch, ни fs, ни spawn.
 * Каждый метод — одна конкретная операция. Смысл в том, чтобы
 * поверхность, доступная коду интерфейса, нельзя было расширить
 * по мере роста приложения.
 *
 * Форма моста продублирована в `src/bridge.ts` — единый тип для
 * всех компонентов. Расширяя мост здесь, обнови и его.
 */

type SaveResult = { ok: true; path: string } | { ok: false; error: string }
type LoadResult = { ok: true; data: unknown | null } | { ok: false; error: string }
type ExportResult =
  | { ok: true; path: string; cancelled?: false }
  | { ok: true; cancelled: true; path?: undefined }
  | { ok: false; error: string }

const api = {
  platform: process.platform,

  // окно
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  onMaximized: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, v: boolean) => cb(v)
    ipcRenderer.on('win:maximized', listener)
    return () => ipcRenderer.removeListener('win:maximized', listener)
  },

  // раскладка
  saveLayout: (state: unknown): Promise<SaveResult> => ipcRenderer.invoke('layout:save', state),
  loadLayout: (): Promise<LoadResult> => ipcRenderer.invoke('layout:load'),
  layoutPath: (): Promise<string> => ipcRenderer.invoke('layout:path'),

  // снимок окна в PNG через диалог сохранения
  exportPng: (): Promise<ExportResult> => ipcRenderer.invoke('shot:export-png'),
}

contextBridge.exposeInMainWorld('transformer', api)

export type TransformerApi = typeof api
