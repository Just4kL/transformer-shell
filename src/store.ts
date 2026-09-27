import { create } from 'zustand'
import {
  BLOCK_MIN,
  MAJOR,
  PAD,
  RAIL_DEFAULT,
  RAIL_MAX,
  RAIL_MIN,
  UNIT,
  clamp,
  snap,
  snapDown,
} from './grid'
import { defaultSize, getBlockDef, type BlockKind } from './blockTypes'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Механизм развёртки: обычный размер / на всё рабочее поле. */
export type ExpandMode = 'normal' | 'full'

export interface Block {
  id: string
  kind: BlockKind
  title: string
  category: string
  rect: Rect
  /** Габарит до «развёртки» на всё поле — чтобы вернуть точно туда же. */
  savedRect: Rect | null
  collapsed: boolean
  expanded: ExpandMode
  content: string
}

export interface Category {
  id: string
  label: string
  glyph: string
}

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: 'in', label: 'Ввод', glyph: '◆' },
  { id: 'core', label: 'Ядро', glyph: '⬢' },
  { id: 'log', label: 'Журнал', glyph: '≡' },
  { id: 'out', label: 'Вывод', glyph: '▷' },
  { id: 'sys', label: 'Система', glyph: '⚙' },
]

interface ShellState {
  railWidth: number
  railCollapsed: boolean
  categories: Category[]
  activeCategory: string
  blocks: Block[]
  seq: number
  showGrid: boolean
  canvas: { w: number; h: number }
  renamingId: string | null

  setRailWidth: (px: number) => void
  toggleRail: () => void
  setActiveCategory: (id: string) => void
  addCategory: (label: string) => void
  renameCategory: (id: string, label: string) => void

  createBlock: (kind: BlockKind, px: number, py: number) => string
  removeBlock: (id: string) => void
  renameBlock: (id: string, title: string) => void
  changeKind: (id: string, kind: BlockKind) => void
  moveToCategory: (id: string, category: string) => void
  setContent: (id: string, content: string) => void
  setRect: (id: string, rect: Rect) => void
  toggleCollapse: (id: string) => void
  toggleFull: (id: string) => void
  beginRename: (id: string | null) => void

  setCanvas: (size: { w: number; h: number }) => void
  toggleGrid: () => void
  clearWorkspace: () => void
}

const normRect = (r: Rect): Rect => ({
  x: snap(Math.max(0, r.x), UNIT),
  y: snap(Math.max(0, r.y), UNIT),
  w: Math.max(BLOCK_MIN, snap(r.w, UNIT)),
  h: Math.max(BLOCK_MIN, snap(r.h, UNIT)),
})

export const useShell = create<ShellState>((set, get) => ({
  railWidth: RAIL_DEFAULT,
  railCollapsed: false,
  categories: [...DEFAULT_CATEGORIES],
  activeCategory: 'core',
  blocks: [],
  seq: 0,
  showGrid: true,
  canvas: { w: 0, h: 0 },
  renamingId: null,

  setRailWidth: (px) => set({ railWidth: clamp(snap(px, MAJOR), RAIL_MIN, RAIL_MAX) }),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setActiveCategory: (id) => set({ activeCategory: id }),
  addCategory: (label) =>
    set((s) => ({
      categories: [
        ...s.categories,
        { id: `c${s.seq}_${s.categories.length}`, label, glyph: '◇' },
      ],
    })),
  renameCategory: (id, label) =>
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? { ...c, label } : c)),
    })),

  createBlock: (kind, px, py) => {
    const s = get()
    const def = getBlockDef(kind)
    const size = defaultSize(kind)
    const id = `b${s.seq}`

    // Точка из контекстного меню — в координатах рабочей области.
    // Блок встаёт на сетку и целиком в пределы полей.
    const maxX = Math.max(PAD, s.canvas.w - PAD - size.w)
    const maxY = Math.max(PAD, s.canvas.h - PAD - size.h)
    const rect = normRect({
      x: clamp(snap(px - size.w / 2, UNIT), PAD, maxX),
      y: clamp(snap(py - UNIT * 2, UNIT), PAD, maxY),
      w: size.w,
      h: size.h,
    })

    const block: Block = {
      id,
      kind,
      title: def.label,
      category: s.activeCategory,
      rect,
      savedRect: null,
      collapsed: false,
      expanded: 'normal',
      content: def.blank,
    }

    set((st) => ({
      blocks: [...st.blocks, block],
      seq: st.seq + 1,
      renamingId: id, // сразу предлагаем назвать блок
    }))
    return id
  },

  removeBlock: (id) =>
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      renamingId: s.renamingId === id ? null : s.renamingId,
    })),

  renameBlock: (id, title) =>
    set((s) => ({
      blocks: s.blocks.map((b) =>
        b.id === id ? { ...b, title: title.trim() || b.title } : b,
      ),
    })),

  changeKind: (id, kind) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, kind } : b)),
    })),

  moveToCategory: (id, category) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, category } : b)),
    })),

  setContent: (id, content) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, content } : b)),
    })),

  setRect: (id, rect) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, rect: normRect(rect) } : b)),
    })),

  toggleCollapse: (id) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b)),
    })),

  toggleFull: (id) =>
    set((s) => ({
      blocks: s.blocks.map((b) => {
        if (b.id !== id) return b
        if (b.expanded === 'full') {
          // возвращаем ровно туда, откуда развернули, но в пределы текущего поля
          return {
            ...b,
            expanded: 'normal',
            collapsed: false,
            savedRect: null,
            rect: b.savedRect
              ? normRect({
                  ...b.savedRect,
                  w: Math.min(b.savedRect.w, s.canvas.w - PAD * 2),
                  h: Math.min(b.savedRect.h, s.canvas.h - PAD * 2),
                })
              : b.rect,
          }
        }
        return {
          ...b,
          expanded: 'full',
          collapsed: false,
          savedRect: { ...b.rect },
          // округляем вниз, чтобы развёрнутый блок тоже стоял на сетке
          rect: {
            x: PAD,
            y: PAD,
            w: snapDown(Math.max(BLOCK_MIN, s.canvas.w - PAD * 2), UNIT),
            h: snapDown(Math.max(BLOCK_MIN, s.canvas.h - PAD * 2), UNIT),
          },
        }
      }),
    })),

  beginRename: (id) => set({ renamingId: id }),

  setCanvas: (size) => {
    const cur = get().canvas
    if (cur.w === size.w && cur.h === size.h) return
    set({ canvas: size })
  },

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  clearWorkspace: () => set({ blocks: [], renamingId: null }),
}))

/** Высота блока с учётом свёрнутого состояния. */
export const blockHeight = (b: Block): number =>
  b.collapsed ? MAJOR : b.expanded === 'full' ? b.rect.h : Math.max(b.rect.h, MAJOR)

/** Габарит блока с учётом развёртки и свёртывания. */
export function blockBox(b: Block, canvas: { w: number; h: number }): Rect {
  if (b.expanded === 'full') {
    // пересчитываем на лету, чтобы блок держал поле при изменении окна,
    // и округляем вниз, чтобы не сойти с сетки
    return {
      x: PAD,
      y: PAD,
      w: snapDown(Math.max(BLOCK_MIN, canvas.w - PAD * 2), UNIT),
      h: snapDown(Math.max(BLOCK_MIN, canvas.h - PAD * 2), UNIT),
    }
  }
  return { x: b.rect.x, y: b.rect.y, w: b.rect.w, h: blockHeight(b) }
}
