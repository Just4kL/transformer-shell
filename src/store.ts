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
import {
  DEFAULT_CATEGORIES,
  type Block,
  type Category,
  type ExpandMode,
  type PersistedState,
  type Rect,
} from './layout'

// Схема данных живёт в layout.ts; переэкспортируем, чтобы существующие
// импорты из store продолжали работать.
export { DEFAULT_CATEGORIES }
export type { Block, Category, ExpandMode, PersistedState, Rect }

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

  createBlock: (kind: BlockKind, x: number, y: number) => string
  /** Новый блок по центру видимой области — для горячей клавиши. */
  createBlockCentered: (kind: BlockKind) => string
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
  hydrate: (p: PersistedState) => void
  toPersisted: () => PersistedState
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

  createBlock: (kind, x, y) => {
    const s = get()
    const def = getBlockDef(kind)
    const size = defaultSize(kind)
    const id = `b${s.seq}`

    // (x, y) — левый верхний угол блока; приводим к сетке и в поля
    const maxX = Math.max(PAD, s.canvas.w - PAD - size.w)
    const maxY = Math.max(PAD, s.canvas.h - PAD - size.h)
    const rect = normRect({
      x: clamp(snap(x, UNIT), PAD, maxX),
      y: clamp(snap(y, UNIT), PAD, maxY),
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

  createBlockCentered: (kind) => {
    const s = get()
    const size = defaultSize(kind)
    // по центру видимой области, с небольшим сдвигом, чтобы новый блок
    // не ложился ровно на предыдущий
    const shift = (s.blocks.length % 5) * MAJOR
    return get().createBlock(
      kind,
      (s.canvas.w - size.w) / 2 + shift,
      (s.canvas.h - size.h) / 2 + shift,
    )
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

  /** Загрузка раскладки с диска. Данные уже прошли sanitize(). */
  hydrate: (p: PersistedState) =>
    set((s) => ({
      railWidth: p.railWidth,
      railCollapsed: p.railCollapsed,
      showGrid: p.showGrid,
      activeCategory: p.activeCategory,
      categories: p.categories,
      blocks: p.blocks,
      seq: p.seq,
      // правка названия при загрузке не должна начинаться сама
      renamingId: null,
      canvas: s.canvas,
    })),

  /** Срез состояния для записи на диск. */
  toPersisted: (): PersistedState => {
    const s = get()
    return {
      railWidth: s.railWidth,
      railCollapsed: s.railCollapsed,
      showGrid: s.showGrid,
      activeCategory: s.activeCategory,
      categories: s.categories,
      seq: s.seq,
      blocks: s.blocks,
    }
  },
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
