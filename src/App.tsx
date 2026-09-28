import { useEffect } from 'react'
import { BAR_H, MAJOR } from './grid'
import { useShell } from './store'
import { initPersistence } from './persistence'
import { TopBar } from './components/TopBar'
import { CategoryRail, Splitter } from './components/CategoryRail'
import { Workspace } from './components/Workspace'

export default function App() {
  const railWidth = useShell((s) => s.railWidth)
  const railCollapsed = useShell((s) => s.railCollapsed)
  const showGrid = useShell((s) => s.showGrid)
  const toggleGrid = useShell((s) => s.toggleGrid)
  const toggleRail = useShell((s) => s.toggleRail)
  const createBlockCentered = useShell((s) => s.createBlockCentered)

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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        createBlockCentered('note')
        return
      }
      if (useShell.getState().renamingId) return
      if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') toggleGrid()
      if (e.key === '[') toggleRail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createBlockCentered, toggleGrid, toggleRail])

  return (
    <div className="shell">
      <TopBar />

      <div className="body">
        <CategoryRail />
        <Workspace />
        <Splitter />
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

