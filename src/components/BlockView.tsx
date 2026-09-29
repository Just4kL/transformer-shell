import { useEffect, useRef } from 'react'
import { BLOCK_HEAD, MAJOR } from '../grid'
import { resolveDef } from '../blockTypes'
import { useBlockPointer, RESIZE_DIRS, type ResizeDir } from '../hooks/useBlockPointer'
import { useInteraction } from '../interaction'
import { useShell, blockBox, type Block } from '../store'
import { BlockBody } from '../blocks/BlockBody'

const DIR_LABEL: Record<ResizeDir, string> = {
  n: 'сверху',
  s: 'снизу',
  e: 'справа',
  w: 'слева',
  ne: 'сверху-справа',
  nw: 'сверху-слева',
  se: 'снизу-справа',
  sw: 'снизу-слева',
}

export function BlockView({
  block,
  onMenu,
  selected,
  onSelect,
}: {
  block: Block
  onMenu: (block: Block, x: number, y: number) => void
  selected: boolean
  onSelect: (id: string) => void
}) {
  const canvas = useShell((s) => s.canvas)
  const renamingId = useShell((s) => s.renamingId)
  const renameBlock = useShell((s) => s.renameBlock)
  const beginRename = useShell((s) => s.beginRename)
  const toggleCollapse = useShell((s) => s.toggleCollapse)
  const toggleFull = useShell((s) => s.toggleFull)
  const moving = useInteraction((s) => s.moving)
  const resizing = useInteraction((s) => s.resizing)
  const tier = useInteraction((s) => s.tier)

  const onDown = useBlockPointer(block)
  const box = blockBox(block, canvas)
  const customs = useShell((s) => s.customTypes)
  const def = resolveDef(block.kind, customs)
  const isRenaming = renamingId === block.id
  const active = moving === block.id || resizing === block.id

  return (
    <section
      className={[
        'block',
        selected ? 'is-selected' : '',
        active ? 'is-active' : '',
        tier === 'major' && active ? 'tier-major' : '',
        block.expanded === 'full' ? 'is-full' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
      }}
      onPointerDown={() => onSelect(block.id)}
    >
      <header
        className="b-head"
        style={{ height: BLOCK_HEAD }}
        onPointerDown={(e) => onDown(e, 'move')}
        onDoubleClick={() => (block.expanded === 'full' ? toggleFull(block.id) : toggleCollapse(block.id))}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSelect(block.id)
          onMenu(block, e.clientX, e.clientY)
        }}
        title="Перетащить за шапку · двойной клик — свернуть/развернуть · содержимое правится двойным кликом по нему"
      >
        <button
          className="b-caret"
          data-no-drag
          onClick={() => toggleCollapse(block.id)}
          title={block.collapsed ? 'Развернуть' : 'Свернуть до одного квадрата'}
        >
          {block.collapsed ? '▸' : '▾'}
        </button>

        <span className="b-glyph" aria-hidden>
          {def.glyph}
        </span>

        {isRenaming ? (
          <RenameInput defaultValue={block.title} onDone={(v) => { renameBlock(block.id, v); beginRename(null) }} />
        ) : (
          <span className="b-title" onDoubleClick={() => beginRename(block.id)}>
            {block.title}
          </span>
        )}

        <span className="b-kind" title={def.hint}>
          {def.label}
        </span>
        <span className="b-q" title={`Габарит в квадратах разметки: ${box.w / MAJOR}◆ × ${box.h / MAJOR}◆`}>
          {box.w / MAJOR}◆×{box.h / MAJOR}◆
        </span>

        <div className="b-tools" data-no-drag>
          <button
            className="b-tool"
            onClick={() => toggleFull(block.id)}
            title={block.expanded === 'full' ? 'Вернуть размер' : 'Развернуть на всё поле'}
          >
            {block.expanded === 'full' ? '⤡' : '⤢'}
          </button>
          <button
            className="b-tool"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(block.id)
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onMenu(block, r.left - 180, r.bottom + 6)
            }}
            title="Меню блока"
          >
            ⋯
          </button>
        </div>
      </header>

      {!block.collapsed && (
        <div className="b-content">
          <BlockBody block={block} />
        </div>
      )}

      {/* гнёзда связей: входы слева, выходы справа */}
      {!block.collapsed && <PortDots block={block} />}

      {!block.collapsed && !active && (
        <>
          {RESIZE_DIRS.map((d) => (
            <span
              key={d}
              className={`b-grip b-grip-${d}`}
              onPointerDown={(e) => onDown(e, 'resize', d)}
              title={`Размер: ${DIR_LABEL[d]}`}
            />
          ))}
        </>
      )}

      {active && <span className="b-measure">{Math.round(box.w / MAJOR)}◆ × {Math.round(box.h / MAJOR)}◆</span>}
    </section>
  )
}

/**
 * Гнёзда блока: входы — левый край, выходы — правый.
 * Тянуть связь — от выходного гнезда; бросить — на входном.
 * Каждое гнездо помечено data-port="blockId:portId" — по этому
 * атрибуту слой связей находит якоря замерами.
 */
function PortDots({ block }: { block: Block }) {
  const begin = useInteraction((s) => s.begin)
  const ins = block.ports.filter((p) => p.dir === 'in')
  const outs = block.ports.filter((p) => p.dir === 'out')

  const startLink = (e: React.PointerEvent, portId: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    // всплытие не останавливаем: пусть блок заодно выберется в панель
    begin({ linking: { block: block.id, port: portId } })
    document.body.dataset.dragging = 'linking'
  }

  const dot = (portId: string, label: string, dir: 'in' | 'out', i: number) => (
    <span
      key={portId}
      className={`b-port b-port-${dir}`}
      data-port={`${block.id}:${portId}`}
      data-dir={dir}
      style={{ top: BLOCK_HEAD + 10 + i * 18 }}
      title={`${label} — ${dir === 'in' ? 'вход' : 'выход'}. Тяни ${dir === 'in' ? 'сюда' : 'отсюда'} связь.`}
      onPointerDown={dir === 'out' ? (e) => startLink(e, portId) : undefined}
    />
  )

  return (
    <>
      {ins.map((p, i) => dot(p.id, p.label, 'in', i))}
      {outs.map((p, i) => dot(p.id, p.label, 'out', i))}
    </>
  )
}

function RenameInput({ defaultValue, onDone }: { defaultValue: string; onDone: (v: string) => void }) {  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  return (
    <input
      ref={ref}
      className="b-rename"
      data-no-drag
      defaultValue={defaultValue}
      placeholder="Название блока"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onDone(e.currentTarget.value)
        if (e.key === 'Escape') onDone(defaultValue)
      }}
      onBlur={(e) => onDone(e.currentTarget.value)}
    />
  )
}

