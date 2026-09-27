import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  BLOCK_MIN,
  MAJOR,
  PAD,
  UNIT,
  clamp,
  nearestCandidate,
  snap,
  snapDown,
  snapFlexible,
  type SnapTier,
} from '../grid'
import { useInteraction } from '../interaction'
import { useShell, blockHeight, type Block, type Rect } from '../store'

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const RESIZE_DIRS: readonly ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface DragStart {
  mode: 'move' | 'resize'
  dir: ResizeDir
  px: number
  py: number
  rect: Rect
}

interface Candidates {
  v: number[]
  h: number[]
}

interface Outcome {
  rect: Rect
  tier: SnapTier
  guides: { v: number[]; h: number[] }
}

/** Опорные линии выравнивания: грани соседних блоков + края рабочего поля. */
function collectCandidates(others: Block[], canvas: { w: number; h: number }): Candidates {
  const v = new Set<number>([0, PAD, canvas.w - PAD, canvas.w])
  const h = new Set<number>([0, PAD, canvas.h - PAD, canvas.h])
  for (const o of others) {
    v.add(o.rect.x)
    v.add(o.rect.x + o.rect.w)
    h.add(o.rect.y)
    h.add(o.rect.y + blockHeight(o))
  }
  return { v: [...v], h: [...h] }
}

const hasMajor = (values: number[]): boolean => values.some((v) => v % MAJOR === 0)

/** Движение блока: сетка + притяжение к граням соседей. */
export function applyMove(
  base: Rect,
  dx: number,
  dy: number,
  cand: Candidates,
  canvas: { w: number; h: number },
): Outcome {
  let x = snap(base.x + dx, UNIT)
  let y = snap(base.y + dy, UNIT)

  const gv: number[] = []
  const gh: number[] = []

  const left = nearestCandidate(x, cand.v)
  if (left !== null) {
    x = left
    gv.push(left)
  }
  const right = nearestCandidate(x + base.w, cand.v)
  if (right !== null) {
    x = right - base.w
    gv.push(right)
  }
  const top = nearestCandidate(y, cand.h)
  if (top !== null) {
    y = top
    gh.push(top)
  }
  const bottom = nearestCandidate(y + base.h, cand.h)
  if (bottom !== null) {
    y = bottom - base.h
    gh.push(bottom)
  }

  // правую/нижнюю границу округляем вниз, иначе блок вылезет за поле
  // на половину малой клетки
  const maxX = snapDown(Math.max(0, canvas.w - base.w), UNIT)
  const maxY = snapDown(Math.max(0, canvas.h - base.h), UNIT)
  x = clamp(x, 0, Math.max(0, maxX))
  y = clamp(y, 0, Math.max(0, maxY))

  const tier: SnapTier = gv.length + gh.length > 0 && hasMajor([...gv, ...gh]) ? 'major' : 'minor'

  return { rect: { x, y, w: base.w, h: base.h }, tier, guides: { v: gv, h: gh } }
}

/** Изменение размера: свободная грань тянется, противоположная зафиксирована. */
export function applyResize(
  base: Rect,
  dx: number,
  dy: number,
  dir: ResizeDir,
  cand: Candidates,
  canvas: { w: number; h: number },
): Outcome {
  const gv: number[] = []
  const gh: number[] = []
  const tiers: SnapTier[] = []

  let x = base.x
  let y = base.y
  let w = base.w
  let h = base.h

  if (dir.includes('e')) {
    const r = snapFlexible(base.w + dx)
    w = r.value
    tiers.push(r.tier)
    const g = nearestCandidate(x + r.value, cand.v)
    if (g !== null) {
      w = g - x
      gv.push(g)
    }
  }
  if (dir.includes('s')) {
    const r = snapFlexible(base.h + dy)
    h = r.value
    tiers.push(r.tier)
    const g = nearestCandidate(y + r.value, cand.h)
    if (g !== null) {
      h = g - y
      gh.push(g)
    }
  }
  if (dir.includes('w')) {
    const r = snapFlexible(base.w - dx)
    w = r.value
    tiers.push(r.tier)
    const g = nearestCandidate(base.x + base.w - r.value, cand.v)
    if (g !== null) {
      w = base.x + base.w - g
      x = g
      gv.push(g)
    }
  }
  if (dir.includes('n')) {
    const r = snapFlexible(base.h - dy)
    h = r.value
    tiers.push(r.tier)
    const g = nearestCandidate(base.y + base.h - r.value, cand.h)
    if (g !== null) {
      h = base.y + base.h - g
      y = g
      gh.push(g)
    }
  }

  // минимальный размер блока — один большой квадрат
  if (w < BLOCK_MIN) {
    if (dir.includes('w')) x = base.x + base.w - BLOCK_MIN
    w = BLOCK_MIN
  }
  if (h < BLOCK_MIN) {
    if (dir.includes('n')) y = base.y + base.h - BLOCK_MIN
    h = BLOCK_MIN
  }

  const maxW = snapDown(Math.max(BLOCK_MIN, canvas.w - x), UNIT)
  const maxH = snapDown(Math.max(BLOCK_MIN, canvas.h - y), UNIT)
  if (w > maxW) w = maxW
  if (h > maxH) h = maxH

  const tier: SnapTier = tiers.includes('major') || hasMajor([...gv, ...gh]) ? 'major' : 'minor'

  return {
    rect: { x: snap(x, UNIT), y: snap(y, UNIT), w: snap(w, UNIT), h: snap(h, UNIT) },
    tier,
    guides: { v: gv, h: gh },
  }
}

/**
 * Перетаскивание и изменение размера блока с автоматическим выравниванием:
 *  — положение и размер округляются к маленькому квадрату;
 *  — рядом с большим квадратом блок притягивается к крупному ритму;
 *  — грани дополнительно притягиваются к граням соседних блоков
 *    с показом направляющих.
 */
export function useBlockPointer(block: Block) {
  const setRect = useShell((s) => s.setRect)
  const canvas = useShell((s) => s.canvas)
  const blocks = useShell((s) => s.blocks)
  const begin = useInteraction((s) => s.begin)
  const setGuides = useInteraction((s) => s.setGuides)
  const setTier = useInteraction((s) => s.setTier)
  const end = useInteraction((s) => s.end)

  const startRef = useRef<DragStart | null>(null)
  const candRef = useRef<Candidates>({ v: [], h: [] })
  const frameRef = useRef(0)
  const lastRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      delete document.body.dataset.dragging
    },
    [],
  )
  const onDown = useCallback(
    (e: ReactPointerEvent, mode: 'move' | 'resize', dir: ResizeDir = 'se') => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement | null
      // не перехватываем клики по кнопкам и полям шапки
      if (mode === 'move' && target?.closest('button, input, select, textarea, [data-no-drag]')) {
        return
      }
      e.preventDefault()

      const others = blocks.filter((b) => b.id !== block.id && b.category === block.category)
      candRef.current = collectCandidates(others, canvas)
      startRef.current = { mode, dir, px: e.clientX, py: e.clientY, rect: { ...block.rect } }

      begin({
        moving: mode === 'move' ? block.id : null,
        resizing: mode === 'resize' ? block.id : null,
      })
      document.body.dataset.dragging = mode === 'move' ? 'moving' : 'resizing'

      const apply = (clientX: number, clientY: number) => {
        const st = startRef.current
        if (!st) return
        const dx = clientX - st.px
        const dy = clientY - st.py
        const out =
          st.mode === 'move'
            ? applyMove(st.rect, dx, dy, candRef.current, canvas)
            : applyResize(st.rect, dx, dy, st.dir, candRef.current, canvas)
        setRect(block.id, out.rect)
        setGuides(out.guides)
        setTier(out.tier)
      }

      const onMove = (ev: PointerEvent) => {
        lastRef.current = { x: ev.clientX, y: ev.clientY }
        if (frameRef.current) return
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0
          apply(ev.clientX, ev.clientY)
        })
      }

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && startRef.current) {
          setRect(block.id, startRef.current.rect)
          cleanup()
        }
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', cleanup)
        window.removeEventListener('keydown', onKey)
        if (frameRef.current) {
          // не теряем последнее положение указателя, если отпустили
          // мышь до отрисовки кадра
          cancelAnimationFrame(frameRef.current)
          frameRef.current = 0
          const last = lastRef.current
          if (last) apply(last.x, last.y)
        }
        lastRef.current = null
        startRef.current = null
        document.body.dataset.dragging = ''
        end()
      }

      const onUp = () => cleanup()

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', cleanup)
      window.addEventListener('keydown', onKey)
    },
    [begin, block.category, block.id, block.rect, blocks, canvas, end, setGuides, setRect, setTier],
  )

  return onDown
}
