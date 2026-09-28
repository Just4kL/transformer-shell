import { create } from 'zustand'
import { sanitize } from './layout'
import { useShell } from './store'

/**
 * Автосохранение раскладки.
 *
 * Тонкости, из-за которых это не просто setInterval:
 *
 *  — при перетаскивании состояние меняется каждый кадр, поэтому запись
 *    идёт с отложкой: ждём, пока пользователь успокоится;
 *  — но ждать бесконечно нельзя, поэтому есть потолок: если изменения
 *    идут дольше MAX_WAIT, всё равно пишем;
 *  — повторно не пишем, если содержимое совпало с последним сохранённым;
 *  — загрузка при старте не должна тут же спровоцировать запись;
 *  — в браузере без Electron моста всё молча выключается.
 */

const DEBOUNCE_MS = 500
const MAX_WAIT_MS = 2500

interface Bridge {
  saveLayout: (state: unknown) => Promise<{ ok: true; path: string } | { ok: false; error: string }>
  loadLayout: () => Promise<{ ok: true; data: unknown | null } | { ok: false; error: string }>
  layoutPath: () => Promise<string>
}

const bridge = (): Bridge | null => {
  const w = window as unknown as { transformer?: Bridge }
  return w.transformer ?? null
}

export type PersistPhase = 'loading' | 'ready' | 'error' | 'off'

interface PersistStatus {
  phase: PersistPhase
  lastSaved: number | null
  error: string | null
  path: string | null
}

export const usePersistStatus = create<PersistStatus>(() => ({
  phase: 'loading',
  lastSaved: null,
  error: null,
  path: null,
}))

export function initPersistence(): () => void {
  const api = bridge()
  if (!api) {
    // запуск в браузере: сохранять некуда, но и падать незачем
    usePersistStatus.setState({ phase: 'off' })
    return () => undefined
  }

  let timer: number | null = null
  let firstChangeAt = 0
  let lastWritten = ''
  let disposed = false
  let hydrated = false

  const write = async () => {
    if (disposed) return
    const payload = useShell.getState().toPersisted()
    const body = JSON.stringify(payload)
    if (body === lastWritten) return
    try {
      const res = await api.saveLayout(payload)
      if (disposed) return
      if (res.ok) {
        lastWritten = body
        usePersistStatus.setState({ phase: 'ready', lastSaved: Date.now(), error: null })
      } else {
        usePersistStatus.setState({ phase: 'error', error: res.error })
      }
    } catch (err) {
      if (!disposed) usePersistStatus.setState({ phase: 'error', error: (err as Error).message })
    }
  }

  const schedule = () => {
    if (timer !== null) clearTimeout(timer)
    const now = Date.now()
    if (firstChangeAt === 0) firstChangeAt = now
    const waited = now - firstChangeAt
    const delay = waited >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS
    timer = window.setTimeout(() => {
      timer = null
      firstChangeAt = 0
      void write()
    }, delay)
  }

  const unsubscribe = useShell.subscribe(() => {
    if (hydrated) schedule()
  })

  // выгрузка: пользователь ушёл в другое окно — дописываем сразу
  const onHide = () => {
    if (!hydrated) return
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
      firstChangeAt = 0
    }
    void write()
  }
  window.addEventListener('blur', onHide)

  const boot = async () => {
    try {
      const [res, p] = await Promise.all([api.loadLayout(), api.layoutPath().catch(() => '')])
      if (disposed) return
      usePersistStatus.setState({ path: p || null })

      if (res.ok && res.data) {
        const state = sanitize(res.data)
        if (state) {
          useShell.getState().hydrate(state)
          lastWritten = JSON.stringify(useShell.getState().toPersisted())
          usePersistStatus.setState({ phase: 'ready', error: null })
          hydrated = true
          return
        }
        usePersistStatus.setState({
          phase: 'error',
          error: 'файл раскладки повреждён — начали с чистого листа',
        })
      }
      usePersistStatus.setState({ phase: 'ready' })
    } catch (err) {
      if (!disposed) usePersistStatus.setState({ phase: 'error', error: (err as Error).message })
    } finally {
      hydrated = true
    }
    // при первом запуске файла ещё нет — создаём его сразу,
    // чтобы путь был виден и следующая запись была не первой
    if (!disposed && lastWritten === '') await write()
  }
  void boot()

  return () => {
    disposed = true
    if (timer !== null) clearTimeout(timer)
    unsubscribe()
    window.removeEventListener('blur', onHide)
  }
}
