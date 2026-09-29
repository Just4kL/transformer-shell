import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useInteraction } from '../interaction'
import { useShell } from '../store'

interface Pt {
  x: number
  y: number
}

interface DrawnLink {
  id: string
  d: string
  title: string
  stub: boolean
  /** Точка для заглушки (связь в скрытую категорию). */
  stubAt?: Pt
}

/** Кривая между гнездами: горизонтальные касательные. */
function curve(a: Pt, b: Pt): string {
  const dx = Math.max(24, Math.abs(b.x - a.x) / 2)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

/**
 * Слой связей поверх холста. Якоря находит замерами
 * `[data-port="blockId:portId"]` относительно холста — поэтому слой
 * пересчитывается на каждое изменение геометрии (перетаскивание идёт
 * через направляющие, они меняются каждый кадр).
 *
 * Здесь же живёт жест «тянуть связь»: начало — pointerdown на выходном
 * гнезде (ставит linking), конец — pointerup над входным гнездом.
 */
export function LinksLayer({ canvasRef }: { canvasRef: RefObject<HTMLDivElement | null> }) {
  const blocks = useShell((s) => s.blocks)
  const links = useShell((s) => s.links)
  const canvas = useShell((s) => s.canvas)
  const addLink = useShell((s) => s.addLink)
  const removeLink = useShell((s) => s.removeLink)
  const linking = useInteraction((s) => s.linking)
  const guides = useInteraction((s) => s.guides)
  const end = useInteraction((s) => s.end)

  const [paths, setPaths] = useState<DrawnLink[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [fromPt, setFromPt] = useState<Pt | null>(null)
  /** Последние замеренные якоря — для броска по близости, без elementFromPoint. */
  const anchorsRef = useRef(new Map<string, { pt: Pt; dir: string }>())

  // замер якорей после каждой отрисовки геометрии
  useLayoutEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) {
      setPaths([])
      return
    }
    const base = canvasEl.getBoundingClientRect()
    // все якоря разом — и для отрисовки, и для броска по близости
    const anchors = new Map<string, { pt: Pt; dir: string }>()
    canvasEl.querySelectorAll('[data-port]').forEach((el) => {
      const key = (el as HTMLElement).dataset.port
      if (!key || anchors.has(key)) return
      const r = el.getBoundingClientRect()
      anchors.set(key, {
        pt: { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top },
        dir: (el as HTMLElement).dataset.dir ?? '',
      })
    })
    const anchor = (key: string): Pt | null => anchors.get(key)?.pt ?? null

    const drawn: DrawnLink[] = []
    for (const l of links) {
      const a = anchor(`${l.from.block}:${l.from.port}`)
      const b = anchor(`${l.to.block}:${l.to.port}`)
      if (a && b) {
        drawn.push({ id: l.id, d: curve(a, b), title: l.label || 'Связь. Клик — удалить (вернёт Ctrl+Z).', stub: false })
      } else if (a || b) {
        // второй конец в скрытой категории — короткая заглушка
        const p = (a ?? b) as Pt
        const dir = a ? 1 : -1
        drawn.push({
          id: l.id,
          d: `M ${p.x} ${p.y} L ${p.x + dir * 44} ${p.y}`,
          title: `${l.label || 'Связь'} — второй конец в другой категории. Клик — удалить.`,
          stub: true,
          stubAt: { x: p.x + dir * 44, y: p.y },
        })
      }
    }
    setPaths(drawn)
    anchorsRef.current = anchors

    if (linking) {
      const start = anchor(`${linking.block}:${linking.port}`)
      setFromPt(start)
    } else {
      setFromPt(null)
    }
    // guides — триггер перерасчёта на каждый кадр перетаскивания
    void guides
    void blocks
    void canvas
  }, [blocks, links, canvas, guides, linking, canvasRef])

  // жест тяги: курсор, бросок, отмена
  useLayoutEffect(() => {
    if (!linking) {
      setCursor(null)
      return
    }
    const onMove = (ev: PointerEvent) => {
      const canvasEl = canvasRef.current
      if (!canvasEl) return
      const base = canvasEl.getBoundingClientRect()
      setCursor({ x: ev.clientX - base.left, y: ev.clientY - base.top })
    }
    const finish = () => {
      document.body.dataset.dragging = ''
      end()
    }
    const onUp = (ev: PointerEvent) => {
      // бросок — по близости к входному гнезду (14px): надёжнее, чем
      // elementFromPoint, и терпит неточное прицеливание мышью
      const canvasEl = canvasRef.current
      if (canvasEl) {
        const base = canvasEl.getBoundingClientRect()
        const x = ev.clientX - base.left
        const y = ev.clientY - base.top
        let best: { block: string; port: string } | null = null
        let bestDist = 14
        for (const [key, a] of anchorsRef.current) {
          if (a.dir !== 'in') continue
          const d = Math.hypot(a.pt.x - x, a.pt.y - y)
          if (d < bestDist) {
            const [block, ...rest] = key.split(':')
            const port = rest.join(':')
            if (block && port && !(block === linking.block && port === linking.port)) {
              best = { block, port }
              bestDist = d
            }
          }
        }
        if (best) addLink(linking, best)
      }
      finish()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') finish()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('keydown', onKey)
    }
  }, [linking, addLink, end, canvasRef])

  return (
    <svg className="links" aria-hidden>
      {paths.map((p) => (
        <g key={p.id}>
          {/* широкая невидимая зона попадания */}
          <path
            d={p.d}
            className="link-hit"
            style={{ pointerEvents: 'stroke' }}
            onClick={() => removeLink(p.id)}
          >
            <title>{p.title}</title>
          </path>
          <path
            d={p.d}
            className={p.stub ? 'link link-stub' : 'link'}
            style={{ pointerEvents: 'none' }}
          />
          {p.stubAt && (
            <text x={p.stubAt.x} y={p.stubAt.y - 6} className="link-xcat" textAnchor="middle">
              ⇄
            </text>
          )}
        </g>
      ))}
      {linking && fromPt && cursor && (
        <path d={curve(fromPt, cursor)} className="link link-temp" style={{ pointerEvents: 'none' }} />
      )}
    </svg>
  )
}
