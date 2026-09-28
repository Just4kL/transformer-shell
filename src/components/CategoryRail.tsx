import { useEffect, useRef, useState } from 'react'
import { MAJOR, fmt, snap } from '../grid'
import { useShell } from '../store'
import { useInteraction } from '../interaction'

/**
 * Рельс главных категорий — минимальная по ширине левая колонка.
 * Ширина всегда кратна большому квадрату, поэтому правая граница
 * рабочего поля остаётся на общей сетке.
 */
export function CategoryRail() {
  const categories = useShell((s) => s.categories)
  const active = useShell((s) => s.activeCategory)
  const setActive = useShell((s) => s.setActiveCategory)
  const blocks = useShell((s) => s.blocks)
  const railWidth = useShell((s) => s.railWidth)
  const collapsed = useShell((s) => s.railCollapsed)
  const toggleRail = useShell((s) => s.toggleRail)
  const addCategory = useShell((s) => s.addCategory)
  const removeCategory = useShell((s) => s.removeCategory)

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const commit = () => {
    const label = draft.trim()
    if (label) addCategory(label)
    setDraft('')
    setAdding(false)
  }

  return (
    <nav
      className={collapsed ? 'rail is-collapsed' : 'rail'}
      style={{ width: collapsed ? 0 : railWidth }}
      aria-label="Категории"
    >
      <div className="rail-head">
        <span className="rail-title">Категории</span>
      </div>

      <ul className="rail-list">
        {categories.map((c) => {
          const n = blocks.filter((b) => b.category === c.id).length
          return (
            <li key={c.id}>
              <button
                className={c.id === active ? 'rail-item is-active' : 'rail-item'}
                onClick={() => setActive(c.id)}
                title={`${c.label} — ${n}`}
              >
                <span className="rail-glyph">{c.glyph}</span>
                <span className="rail-label">{c.label}</span>
                <span className="rail-n">{n}</span>
                {categories.length > 1 && (
                  <span
                    className="rail-del"
                    role="button"
                    tabIndex={-1}
                    title={`Удалить «${c.label}» — блоки перейдут в первую категорию. Можно отменить (Ctrl+Z).`}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCategory(c.id)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    ✕
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="rail-foot">
        {adding ? (
          <input
            ref={inputRef}
            className="rail-input"
            value={draft}
            placeholder="Название…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft('')
                setAdding(false)
              }
            }}
          />
        ) : (
          <button className="rail-add" onClick={() => setAdding(true)} title="Добавить категорию">
            + категория
          </button>
        )}

        <button
          className="rail-collapse"
          onClick={toggleRail}
          title="Свернуть / развернуть рельс (двойной клик по разделителю)"
        >
          {collapsed ? '›' : '‹'}
        </button>

        <span className="rail-width" title="Ширина рельса в квадратах разметки">
          {collapsed ? '0' : fmt(railWidth)}
        </span>
      </div>
    </nav>
  )
}

/**
 * Разделитель. Граница между рельсом и рабочим полем тянется мышью
 * и притягивается к большому квадрату. Слой не участвует в раскладке
 * (position: absolute), поэтому не сдвигает сетку.
 */
export function Splitter() {
  const railWidth = useShell((s) => s.railWidth)
  const collapsed = useShell((s) => s.railCollapsed)
  const setRailWidth = useShell((s) => s.setRailWidth)
  const toggleRail = useShell((s) => s.toggleRail)
  const railDrag = useInteraction((s) => s.rail)
  const railPreview = useInteraction((s) => s.railPreview)
  const begin = useInteraction((s) => s.begin)
  const setRailPreview = useInteraction((s) => s.setRailPreview)
  const end = useInteraction((s) => s.end)

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    begin({ rail: true })
    document.body.dataset.dragging = 'rail'

    const onMove = (ev: PointerEvent) => {
      // сплиттер лежит поверх рельса и рабочего поля, его X совпадает
      // с X окна — притягиваем границу к большому квадрату
      const next = snap(ev.clientX, MAJOR)
      setRailPreview(next)
      setRailWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.dataset.dragging = ''
      end()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={railDrag ? 'splitter is-active' : 'splitter'}
      style={{ left: collapsed ? 0 : railWidth }}
      onPointerDown={onDown}
      onDoubleClick={toggleRail}
      role="separator"
      aria-orientation="vertical"
      aria-label="Граница между категориями и рабочим полем"
    >
      <span className="splitter-grip">
        <i />
        <i />
        <i />
      </span>
      {railDrag && !collapsed && <span className="splitter-hint">{fmt(railPreview ?? railWidth)}</span>}
    </div>
  )
}
