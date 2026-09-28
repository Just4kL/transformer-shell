import { useEffect, useState } from 'react'
import { MAJOR, UNIT, fmt } from '../grid'
import { usePersistStatus } from '../persistence'
import { useHistoryStatus, useShell } from '../store'
import { getBridge } from '../bridge'

const api = getBridge()

export function TopBar() {
  const categories = useShell((s) => s.categories)
  const active = useShell((s) => s.activeCategory)
  const blocks = useShell((s) => s.blocks)
  const showGrid = useShell((s) => s.showGrid)
  const toggleGrid = useShell((s) => s.toggleGrid)
  const panelOpen = useShell((s) => s.panelOpen)
  const togglePanel = useShell((s) => s.togglePanel)
  const undo = useShell((s) => s.undo)
  const redo = useShell((s) => s.redo)
  const canUndo = useHistoryStatus((s) => s.canUndo)
  const canRedo = useHistoryStatus((s) => s.canRedo)
  const canvas = useShell((s) => s.canvas)

  const [maximized, setMaximized] = useState(false)
  useEffect(() => api?.onMaximized(setMaximized), [])

  const current = categories.find((c) => c.id === active)
  const count = blocks.filter((b) => b.category === active).length

  return (
    <header className="topbar" style={{ height: UNIT * 5 }}>
      <div className="tb-brand" data-no-drag>
        <span className="tb-mark" aria-hidden />
        <span className="tb-name">Трансформер</span>
      </div>

      <div className="tb-crumb">
        <span className="tb-cat">{current?.glyph}</span>
        <span className="tb-cat-label">{current?.label ?? '—'}</span>
        <span className="tb-count">{count}</span>
      </div>

      <div className="tb-tools" data-no-drag>
        <SaveIndicator />
        <span className="tb-group" role="group" aria-label="Отмена и возврат">
          <button className="tb-btn tb-icon" onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)">
            ↩
          </button>
          <button
            className="tb-btn tb-icon"
            onClick={redo}
            disabled={!canRedo}
            title="Вернуть (Ctrl+Shift+Z)"
          >
            ↪
          </button>
        </span>
        <button
          className={panelOpen ? 'tb-btn is-on' : 'tb-btn'}
          onClick={togglePanel}
          title="Панель свойств ( ] )"
        >
          <span className="tb-panel-icon" aria-hidden />
          Панель
        </button>
        <button
          className={showGrid ? 'tb-btn is-on' : 'tb-btn'}
          onClick={toggleGrid}
          title="Показать двойную разметку (G)"
        >
          <span className="tb-grid-icon" aria-hidden />
          Сетка
        </button>
        <span className="tb-metric" title="Размер рабочего поля в квадратах разметки">
          {canvas.w ? `${fmt(canvas.w)} × ${fmt(canvas.h)}` : '—'}
        </span>
        <span className="tb-metric tb-metric-dim">{MAJOR}px ◆</span>
      </div>

      <div className="tb-win" data-no-drag>
        <button className="tb-wbtn" onClick={() => api?.minimize()} title="Свернуть" aria-label="Свернуть">
          <svg viewBox="0 0 10 10" aria-hidden>
            <rect x="1" y="4.5" width="8" height="1" />
          </svg>
        </button>
        <button
          className="tb-wbtn"
          onClick={() => api?.toggleMaximize()}
          title={maximized ? 'Восстановить' : 'Развернуть'}
          aria-label={maximized ? 'Восстановить' : 'Развернуть'}
        >
          {maximized ? (
            <svg viewBox="0 0 10 10" aria-hidden>
              <rect x="1" y="3" width="6" height="6" />
              <path d="M3 3V1.5h5.5V7H7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" aria-hidden>
              <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button className="tb-wbtn is-close" onClick={() => api?.close()} title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </header>
  )
}

/** Состояние автосохранения раскладки. */
function SaveIndicator() {
  const phase = usePersistStatus((s) => s.phase)
  const lastSaved = usePersistStatus((s) => s.lastSaved)
  const error = usePersistStatus((s) => s.error)
  const path = usePersistStatus((s) => s.path)

  if (phase === 'off') return null

  const label =
    phase === 'loading'
      ? 'загрузка…'
      : phase === 'error'
        ? 'не сохранено'
        : lastSaved !== null
          ? `сохранено ${new Date(lastSaved).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          : 'из файла'

  const title =
    phase === 'error'
      ? (error ?? 'неизвестная ошибка')
      : (path ?? 'файл раскладки')

  return (
    <span className={`tb-save is-${phase}`} title={title}>
      <i aria-hidden />
      {label}
    </span>
  )
}
