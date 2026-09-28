/**
 * Узкий мост между рендерером и главным процессом.
 * Единственное место, где описан `window.transformer`, — все компоненты
 * берут его отсюда. В браузере без Electron моста нет — каждый вызов
 * обязан это проверять.
 */

type SaveResult = { ok: true; path: string } | { ok: false; error: string }
type LoadResult = { ok: true; data: unknown | null } | { ok: false; error: string }
export type ExportResult =
  | { ok: true; path: string; cancelled?: false }
  | { ok: true; cancelled: true; path?: undefined }
  | { ok: false; error: string }

export interface TransformerBridge {
  platform: string

  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  onMaximized: (cb: (maximized: boolean) => void) => () => void

  saveLayout: (state: unknown) => Promise<SaveResult>
  loadLayout: () => Promise<LoadResult>
  layoutPath: () => Promise<string>

  /** Снимок окна в PNG через диалог сохранения. */
  exportPng: () => Promise<ExportResult>
}

export const getBridge = (): TransformerBridge | null =>
  (window as unknown as { transformer?: TransformerBridge }).transformer ?? null
