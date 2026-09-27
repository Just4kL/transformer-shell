import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  onMaximized: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, v: boolean) => cb(v)
    ipcRenderer.on('win:maximized', listener)
    return () => ipcRenderer.removeListener('win:maximized', listener)
  },
}

contextBridge.exposeInMainWorld('transformer', api)

export type TransformerApi = typeof api
