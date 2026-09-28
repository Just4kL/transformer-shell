import { app } from 'electron'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Хранилище раскладки.
 *
 * Лежит рядом с другими данными приложения (Windows: %APPDATA%\transformer-shell).
 * Запись атомарная: сначала во временный файл, затем переименование —
 * так падение посреди сохранения не оставит после себя обрезанный JSON.
 */

const FILE_NAME = 'layout.json'
const MAX_BYTES = 8 * 1024 * 1024

export interface LayoutFile {
  version: number
  savedAt: string
  state: unknown
}

export function layoutPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

export function readLayout(): LayoutFile | null {
  const file = layoutPath()
  try {
    const stat = fs.statSync(file)
    if (stat.size > MAX_BYTES) {
      console.warn(`[layout] файл больше ${MAX_BYTES} байт — игнорирую`)
      return null
    }
    const raw = fs.readFileSync(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as LayoutFile
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code !== 'ENOENT') {
      // файл есть, но прочитать не вышло — сообщаем, но приложение не роняем
      console.warn('[layout] не удалось прочитать раскладку:', e.message)
    }
    return null
  }
}

export async function writeLayout(state: unknown): Promise<{ ok: true; path: string }> {
  const file = layoutPath()
  const tmp = `${file}.tmp`
  const payload: LayoutFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    state,
  }

  await fsp.mkdir(path.dirname(file), { recursive: true })

  const body = JSON.stringify(payload, null, 2)
  if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
    throw new Error('раскладка слишком велика')
  }

  // сначала во временный файл, потом атомарное переименование
  const handle = await fsp.open(tmp, 'w')
  try {
    await handle.writeFile(body, 'utf8')
    await handle.sync() // данные на диске до переименования
  } finally {
    await handle.close()
  }
  await fsp.rename(tmp, file)
  return { ok: true, path: file }
}
