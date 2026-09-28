import { useEffect } from 'react'
import { BAR_H, MAJOR } from './grid'
import { useShell } from './store'
import { initPersistence } from './persistence'
import { TopBar } from './components/TopBar'
import { CategoryRail, Splitter } from './components/CategoryRail'
import { Workspace } from './components/Workspace'
import { PropertiesPanel } from './components/PropertiesPanel'

export default function App() {
  const railWidth = useShell((s) => s.railWidth)
  const railCollapsed = useShell((s) => s.railCollapsed)
  const showGrid = useShell((s) => s.showGrid)
  const toggleGrid = useShell((s) => s.toggleGrid)
  const toggleRail = useShell((s) => s.toggleRail)
  const togglePanel = useShell((s) => s.togglePanel)
  const createBlockCentered = useShell((s) => s.createBlockCentered)
  const undo = useShell((s) => s.undo)
  const redo = useShell((s) => s.redo)

  // раскладка: читаем при старте, пишем при изменениях
  useEffect(() => initPersistence(), [])

  // горячие клавиши оболочки
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      // цель может быть не элементом (document/window) — тогда нечего проверять
      const el = t instanceof HTMLElement ? t : null
      const tag = el?.tagName
      // в полях ввода и во время переименования блока — не перехватываем
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.closest('.b-rename')) return

      // e.key зависит от раскладки: на русской Ctrl+Z даёт key='я'.
      // e.code — физическая клавиша, от раскладки не зависит.
      // Проверяем оба, чтобы работало везде.
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (mod && (e.code === 'KeyN' || k === 'n')) {
        e.preventDefault()
        createBlockCentered('note')
        return
      }
      // отмена / возврат — только вне полей ввода (там работает своя)
      if (mod && (e.code === 'KeyZ' || k === 'z' || k === 'я')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && (e.code === 'KeyY' || k === 'y' || k === 'н')) {
        e.preventDefault()
        redo()
        return
      }
      if (useShell.getState().renamingId) return
      if (e.code === 'KeyG' || k === 'g' || k === 'п') toggleGrid()
      if (e.code === 'BracketLeft' || e.key === '[' || k === 'х') toggleRail()
      if (e.code === 'BracketRight' || e.key === ']' || k === 'ъ') togglePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createBlockCentered, redo, toggleGrid, togglePanel, toggleRail, undo])

  return (
    <div className="shell">
      <TopBar />

      <div className="body">
        <CategoryRail />
        <Workspace />
        <Splitter />
        <PropertiesPanel />
      </div>

      {showGrid && (
        <div
          className="grid-global"
          style={{
            backgroundImage: [
              `repeating-linear-gradient(to right, var(--grid-maj) 0 1px, transparent 1px ${MAJOR}px)`,
              `repeating-linear-gradient(to bottom, var(--grid-maj) 0 1px, transparent 1px ${MAJOR}px)`,
            ].join(','),
            ['--rail' as string]: `${railCollapsed ? 0 : railWidth}px`,
            ['--bar' as string]: `${BAR_H}px`,
          }}
          aria-hidden
        />
      )}

    </div>
  )
}

