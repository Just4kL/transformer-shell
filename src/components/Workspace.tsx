import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAJOR, PAD, UNIT, gridOffset } from '../grid'
import { BLOCK_DEFS, BUILTINS, defaultSize, resolveDef } from '../blockTypes'
import { getBridge } from '../bridge'
import { useInteraction } from '../interaction'
import { useShell, blockBox, type Block } from '../store'
import { BlockView } from './BlockView'
import { blockMenuItems } from './blockMenu'
import { LinksLayer } from './LinksLayer'
import { ContextMenu } from './ContextMenu'
import { sep, type MenuItem, type MenuRequest } from './menu'

export function Workspace() {
  const railWidth = useShell((s) => s.railWidth)
  const categories = useShell((s) => s.categories)
  const active = useShell((s) => s.activeCategory)
  const blocks = useShell((s) => s.blocks)
  const customs = useShell((s) => s.customTypes)
  const canvas = useShell((s) => s.canvas)
  const setCanvas = useShell((s) => s.setCanvas)
  const showGrid = useShell((s) => s.showGrid)
  const toggleGrid = useShell((s) => s.toggleGrid)
  const createBlock = useShell((s) => s.createBlock)
  const removeBlock = useShell((s) => s.removeBlock)
  const spawnCustomBlock = useShell((s) => s.spawnCustomBlock)
  const changeKind = useShell((s) => s.changeKind)
  const moveToCategory = useShell((s) => s.moveToCategory)
  const toggleCollapse = useShell((s) => s.toggleCollapse)
  const toggleFull = useShell((s) => s.toggleFull)
  const beginRename = useShell((s) => s.beginRename)
  const selected = useShell((s) => s.selectedId)
  const select = useShell((s) => s.select)
  const clearCategory = useShell((s) => s.clearCategory)

  const viewRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)

  const visible = useMemo(() => blocks.filter((b) => b.category === active), [blocks, active])

  // размер рабочего поля = вьюпорт прокрутки
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCanvas({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setCanvas({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [setCanvas])

  // высота полотна — до нижней грани самого нижнего блока
  const contentH = useMemo(() => {
    if (visible.length === 0) return canvas.h
    const bottom = Math.max(...visible.map((b) => {
      const box = blockBox(b, canvas)
      return box.y + box.h
    }))
    return Math.max(canvas.h, bottom + PAD)
  }, [visible, canvas])

  // прокрутка тоже держится мелкого квадрата, иначе сетка «плывёт»
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const y = el.scrollTop
    if (y % UNIT !== 0) el.scrollTop = snapDownUnit(y)
  }

  const localPoint = useCallback((clientX: number, clientY: number) => {
    const canvasEl = canvasRef.current
    const viewEl = viewRef.current
    if (!canvasEl || !viewEl) return { x: PAD, y: PAD }
    const r = canvasEl.getBoundingClientRect()
    return {
      x: Math.max(0, clientX - r.left + viewEl.scrollLeft),
      y: Math.max(0, clientY - r.top + viewEl.scrollTop),
    }
  }, [])

  const openCreateMenu = (clientX: number, clientY: number) => {
    const p = localPoint(clientX, clientY)
    setHoverPoint(p)
    setMenu({ x: clientX, y: clientY, items: createMenuItems(p) })
  }

  const closeMenu = () => {
    setMenu(null)
    setHoverPoint(null)
  }

  function createMenuItems(p: { x: number; y: number }): MenuItem[] {
    // p — точка правого клика; блок встаёт под курсором, на сетке
    const at = (kind: string) => () =>
      createBlock(kind, p.x - defaultSize(kind, customs).w / 2, p.y - UNIT * 2)

    const newChildren: MenuItem[] = BLOCK_DEFS.map((d) => ({
      id: `new-${d.kind}`,
      label: d.label,
      hint: d.hint,
      glyph: d.glyph,
      onSelect: at(d.kind),
    }))
    for (const t of customs) {
      const resolved = resolveDef(t.id, customs)
      newChildren.push({
        id: `new-${t.id}`,
        label: t.label,
        hint: t.hint || 'свой тип',
        glyph: t.glyph,
        onSelect: () => createBlock(t.id, p.x - resolved.w * MAJOR / 2, p.y - UNIT * 2),
      })
    }

    const canExport = getBridge()?.exportPng !== undefined

    return [
      {
        id: 'new',
        label: 'Создать блок',
        glyph: '+',
        children: newChildren,
      },
      {
        id: 'new-type',
        label: 'Новый тип блока…',
        glyph: '＋',
        children: BUILTINS.map((base) => {
          const d = resolveDef(base, customs)
          return {
            id: `new-type-${base}`,
            label: d.label,
            hint: 'свой тип на этой основе',
            glyph: d.glyph,
            onSelect: () => spawnCustomBlock(base, p.x, p.y),
          }
        }),
      },
      {
        id: 'new-at-pad',
        label: 'Создать на полях',
        glyph: '⊞',
        onSelect: () => createBlock('note', PAD, PAD),
      },
      sep('sep1'),
      {
        id: 'grid',
        label: 'Двойная разметка',
        glyph: '▦',
        checked: showGrid,
        onSelect: toggleGrid,
      },
      ...(canExport
        ? [
            {
              id: 'export',
              label: 'Экспорт поля в PNG…',
              glyph: '⤓',
              onSelect: () => void getBridge()?.exportPng(),
            } as MenuItem,
          ]
        : []),
      sep('sep2'),
      {
        id: 'clear',
        label: 'Очистить категорию',
        glyph: '⌫',
        danger: true,
        disabled: visible.length === 0,
        onSelect: () => clearCategory(),
      },
    ]
  }

  const openBlockMenu = (block: Block, x: number, y: number) => {
    setMenu({
      x,
      y,
      items: blockMenuItems(
        block,
        {
          rename: () => beginRename(block.id),
          setKind: (k) => changeKind(block.id, k),
          moveTo: (c) => moveToCategory(block.id, c),
          collapse: () => toggleCollapse(block.id),
          full: () => toggleFull(block.id),
          remove: () => removeBlock(block.id),
        },
        categories,
        customs,
      ),
    })
  }

  return (
    <>
      <div
        className="ws"
        ref={viewRef}
        onScroll={onScroll}
        onContextMenu={(e) => {
          e.preventDefault()
          select(null)
          openCreateMenu(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 2 && menu) setHoverPoint(localPoint(e.clientX, e.clientY))
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) select(null)
        }}
      >
        <div className="ws-canvas" ref={canvasRef} style={{ height: contentH }}>
          {showGrid && <DualGrid offset={gridOffset(railWidth)} />}

          {visible.length === 0 && (
            <div className="ws-empty">
              <div className="ws-empty-card">
                <span className="ws-empty-glyph">▦</span>
                <p>
                  Категория пуста.
                  <br />
                  Правый клик по полю → <b>Создать блок</b>.
                </p>
                <p className="ws-empty-sub">
                  малая клетка {UNIT}px · большая {MAJOR}px
                </p>
              </div>
            </div>
          )}

          {visible.map((b) => (
            <BlockView
              key={b.id}
              block={b}
              selected={selected === b.id}
              onSelect={select}
              onMenu={openBlockMenu}
            />
          ))}

          <Guides />
          <LinksLayer canvasRef={canvasRef} />
          {menu && hoverPoint && <CreationMark point={hoverPoint} />}
        </div>
      </div>

      {menu && <ContextMenu request={menu} onClose={closeMenu} />}
    </>
  )
}

const snapDownUnit = (v: number) => Math.floor(v / UNIT) * UNIT

/** Двойная разметка: малая сетка UNIT + крупная MAJOR, в фазе с сеткой окна. */
function DualGrid({ offset }: { offset: { x: number; y: number } }) {
  return (
    <div
      className="grid"
      style={{
        backgroundImage: [
          `repeating-linear-gradient(to right, var(--grid-min) 0 1px, transparent 1px ${UNIT}px)`,
          `repeating-linear-gradient(to bottom, var(--grid-min) 0 1px, transparent 1px ${UNIT}px)`,
          `repeating-linear-gradient(to right, var(--grid-maj) 0 1px, transparent 1px ${MAJOR}px)`,
          `repeating-linear-gradient(to bottom, var(--grid-maj) 0 1px, transparent 1px ${MAJOR}px)`,
        ].join(','),
        backgroundPosition: `${offset.x}px ${offset.y}px`,
      }}
    />
  )
}

/** Направляющие выравнивания по граням соседних блоков. */
function Guides() {
  const guides = useInteraction((s) => s.guides)
  const visible = useInteraction((s) => Boolean(s.moving || s.resizing))
  if (!visible || (guides.v.length === 0 && guides.h.length === 0)) return null
  return (
    <>
      {guides.v.map((x) => (
        <span className="guide guide-v" key={`v${x}`} style={{ left: x }} />
      ))}
      {guides.h.map((y) => (
        <span className="guide guide-h" key={`h${y}`} style={{ top: y }} />
      ))}
    </>
  )
}

/** Призрак будущего блока под курсором при выборе типа из меню. */
function CreationMark({ point }: { point: { x: number; y: number } }) {
  return (
    <span
      className="mark"
      style={{ left: point.x, top: point.y, width: 128, height: 128 }}
      aria-hidden
    />
  )
}
