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
import { defaultSize, resolveDef, type BlockKind, type BuiltinKind, type CustomTypeDef } from './blockTypes'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  type Block,
  type Category,
  type ExpandMode,
  type LayoutSettings,
  type Link,
  type LinkEndpoint,
  type PersistedState,
  type Port,
  type Rect,
} from './layout'

// Схема данных живёт в layout.ts; переэкспортируем, чтобы существующие
// импорты из store продолжали работать.
export { DEFAULT_CATEGORIES, DEFAULT_SETTINGS }
export type { Block, Category, ExpandMode, LayoutSettings, Link, LinkEndpoint, PersistedState, Port, Rect }
export type { CustomTypeDef }

interface ShellState {
  railWidth: number
  railCollapsed: boolean
  categories: Category[]
  activeCategory: string
  /** Пользовательские типы блоков (оформление поверх встроенных рендеров). */
  customTypes: CustomTypeDef[]
  blocks: Block[]
  seq: number
  showGrid: boolean
  /** Панель свойств справа открыта. */
  panelOpen: boolean
  /** Выбранный блок — для панели свойств. Не сохраняется в файл. */
  selectedId: string | null
  canvas: { w: number; h: number }
  renamingId: string | null

  setRailWidth: (px: number) => void
  toggleRail: () => void
  setActiveCategory: (id: string) => void
  addCategory: (label: string) => void
  renameCategory: (id: string, label: string) => void
  /** Удалить категорию. Блоки переезжают в первую оставшуюся. Последнюю удалить нельзя. */
  removeCategory: (id: string) => void

  createBlock: (kind: BlockKind, x: number, y: number) => string
  /** Новый блок по центру видимой области — для горячей клавиши. */
  createBlockCentered: (kind: BlockKind) => string
  /**
   * Новый пользовательский тип на основе встроенного + сразу блок этого
   * типа в указанной точке. Одна контрольная точка истории на всё.
   * Возвращает id типа либо '' если упёрлись в лимит.
   */
  spawnCustomBlock: (base: BuiltinKind, x: number, y: number) => string
  removeBlock: (id: string) => void
  renameBlock: (id: string, title: string) => void
  changeKind: (id: string, kind: BlockKind) => void
  moveToCategory: (id: string, category: string) => void
  setContent: (id: string, content: string) => void
  setRect: (id: string, rect: Rect) => void
  /** Шаг размера в больших квадратах — для панели свойств. */
  nudgeSize: (id: string, dw: number, dh: number) => void
  toggleCollapse: (id: string) => void
  toggleFull: (id: string) => void
  beginRename: (id: string | null) => void
  select: (id: string | null) => void
  togglePanel: () => void

  createCustomType: (base: BuiltinKind) => string
  updateCustomType: (id: string, patch: Partial<Omit<CustomTypeDef, 'id'>>) => void
  /** Удалить тип. Блоки этого типа переходят на его базовый рендер. */
  removeCustomType: (id: string) => void

  /** Связи между портами. Не сохраняются отдельно — часть документа. */
  links: Link[]
  settings: LayoutSettings
  setCycleLimit: (n: number) => void
  /**
   * Новая связь. Возвращает id либо null, если соединять нечего:
   * не out→in, петля в тот же порт, дубликат пары, конец не найден,
   * упёрлись в лимит. Невалидный бросок просто не создаёт связь.
   */
  addLink: (from: LinkEndpoint, to: LinkEndpoint) => string | null
  removeLink: (id: string) => void
  setLinkLabel: (id: string, label: string) => void

  /** Гнезда блока. Лимит 200 на блок — предохранитель, не цель. */
  addPort: (blockId: string, dir: 'in' | 'out', label?: string) => string
  renamePort: (blockId: string, portId: string, label: string) => void
  /** Удалить гнездо. Связи через него удаляются тем же шагом. */
  removePort: (blockId: string, portId: string) => void

  setCanvas: (size: { w: number; h: number }) => void
  toggleGrid: () => void
  clearWorkspace: () => void
  clearCategory: () => void
  hydrate: (p: PersistedState, resetHistory?: boolean) => void
  toPersisted: () => PersistedState

  /** Контрольная точка для отмены. Вызывать ДО изменения. */
  checkpoint: () => void
  undo: () => boolean
  redo: () => boolean
}

/** Можно ли отменить / вернуть — для кнопок панели окна. */
export const useHistoryStatus = create<{ canUndo: boolean; canRedo: boolean }>(() => ({
  canUndo: false,
  canRedo: false,
}))

// История отмены: только документ (блоки, категории, типы), без холста.
// Лежит вне стора, поэтому не попадает в файл раскладки.
const HISTORY_CAP = 50
let past: PersistedState[] = []
let future: PersistedState[] = []

const syncHistoryStatus = () =>
  useHistoryStatus.setState({ canUndo: past.length > 0, canRedo: future.length > 0 })

const normRect = (r: Rect): Rect => ({
  x: snap(Math.max(0, r.x), UNIT),
  y: snap(Math.max(0, r.y), UNIT),
  w: Math.max(BLOCK_MIN, snap(r.w, UNIT)),
  h: Math.max(BLOCK_MIN, snap(r.h, UNIT)),
})

/** Стартовая пара гнезд нового блока — сразу можно связывать. */
const defaultPorts = (seqStart: number): { ports: Port[]; nextSeq: number } => ({
  ports: [
    { id: `p${seqStart}`, label: 'Вход', dir: 'in', data: 'any' },
    { id: `p${seqStart + 1}`, label: 'Выход', dir: 'out', data: 'any' },
  ],
  nextSeq: seqStart + 2,
})

export const useShell = create<ShellState>((set, get) => ({
  railWidth: RAIL_DEFAULT,
  railCollapsed: false,
  categories: [...DEFAULT_CATEGORIES],
  activeCategory: 'core',
  customTypes: [],
  blocks: [],
  links: [],
  settings: { ...DEFAULT_SETTINGS },
  seq: 0,
  showGrid: true,
  panelOpen: true,
  selectedId: null,
  canvas: { w: 0, h: 0 },
  renamingId: null,

  setRailWidth: (px) => set({ railWidth: clamp(snap(px, MAJOR), RAIL_MIN, RAIL_MAX) }),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  // смена категории — навигация, а не правка: точку истории не ставим,
  // но выбор сбрасываем, чтобы панель не показывала скрытый блок
  setActiveCategory: (id) => set({ activeCategory: id, selectedId: null }),
  addCategory: (label) => {
    get().checkpoint()
    set((s) => ({
      categories: [
        ...s.categories,
        { id: `c${s.seq}_${s.categories.length}`, label, glyph: '◇' },
      ],
    }))
  },
  renameCategory: (id, label) => {
    get().checkpoint()
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? { ...c, label } : c)),
    }))
  },
  removeCategory: (id) => {
    const s = get()
    if (s.categories.length <= 1) return
    if (!s.categories.some((c) => c.id === id)) return
    get().checkpoint()
    set((st) => {
      const rest = st.categories.filter((c) => c.id !== id)
      const fallback = rest[0].id
      return {
        categories: rest,
        activeCategory: st.activeCategory === id ? fallback : st.activeCategory,
        blocks: st.blocks.map((b) => (b.category === id ? { ...b, category: fallback } : b)),
      }
    })
  },

  createBlock: (kind, x, y) => {
    const s = get()
    const def = resolveDef(kind, s.customTypes)
    const size = defaultSize(kind, s.customTypes)
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
      ports: defaultPorts(s.seq + 1).ports,
    }

    get().checkpoint()
    set((st) => ({
      blocks: [...st.blocks, block],
      seq: st.seq + 3,
      renamingId: id, // сразу предлагаем назвать блок
      selectedId: id,
    }))
    return id
  },

  createBlockCentered: (kind) => {
    const s = get()
    const size = defaultSize(kind, s.customTypes)
    // по центру видимой области, с небольшим сдвигом, чтобы новый блок
    // не ложился ровно на предыдущий
    const shift = (s.blocks.length % 5) * MAJOR
    return get().createBlock(
      kind,
      (s.canvas.w - size.w) / 2 + shift,
      (s.canvas.h - size.h) / 2 + shift,
    )
  },

  spawnCustomBlock: (base, x, y) => {
    const s = get()
    if (s.customTypes.length >= 100) return ''
    const def = resolveDef(base, s.customTypes)
    const size = defaultSize(base, s.customTypes)
    const typeId = `u${s.seq}`
    const blockId = `b${s.seq + 1}`
    const { ports } = defaultPorts(s.seq + 2)

    const maxX = Math.max(PAD, s.canvas.w - PAD - size.w)
    const maxY = Math.max(PAD, s.canvas.h - PAD - size.h)
    const rect = normRect({
      x: clamp(snap(x, UNIT), PAD, maxX),
      y: clamp(snap(y, UNIT), PAD, maxY),
      w: size.w,
      h: size.h,
    })

    get().checkpoint()
    set((st) => ({
      customTypes: [
        ...st.customTypes,
        {
          id: typeId,
          label: 'Новый тип',
          glyph: '◇',
          hint: '',
          base,
          w: def.w,
          h: def.h,
          blank: def.blank,
        },
      ],
      blocks: [
        ...st.blocks,
        {
          id: blockId,
          kind: typeId,
          title: 'Новый тип',
          category: st.activeCategory,
          rect,
          savedRect: null,
          collapsed: false,
          expanded: 'normal',
          content: def.blank,
          ports,
        },
      ],
      seq: st.seq + 4,
      renamingId: null, // название правится в панели, вместе с типом
      selectedId: blockId,
    }))
    // панель должна быть видна, иначе новый тип негде настраивать
    set({ panelOpen: true })
    return typeId
  },

  removeBlock: (id) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      // связи висели на блоке — уходят тем же шагом
      links: s.links.filter((l) => l.from.block !== id && l.to.block !== id),
      renamingId: s.renamingId === id ? null : s.renamingId,
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },
  renameBlock: (id, title) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) =>
        b.id === id ? { ...b, title: title.trim() || b.title } : b,
      ),
    }))
  },

  changeKind: (id, kind) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, kind } : b)),
    }))
  },

  moveToCategory: (id, category) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, category } : b)),
    }))
  },

  setContent: (id, content) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, content } : b)),
    }))
  },

  setRect: (id, rect) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, rect: normRect(rect) } : b)),
    })),

  /** Шаг размера в больших квадратах: точка истории ставится на каждый шаг. */
  nudgeSize: (id, dw, dh) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) => {
        if (b.id !== id) return b
        const w = Math.max(BLOCK_MIN, snap(b.rect.w + dw * MAJOR, UNIT))
        const h = Math.max(BLOCK_MIN, snap(b.rect.h + dh * MAJOR, UNIT))
        const maxW = snapDown(Math.max(BLOCK_MIN, s.canvas.w - b.rect.x), UNIT)
        const maxH = snapDown(Math.max(BLOCK_MIN, s.canvas.h - b.rect.y), UNIT)
        return { ...b, rect: { ...b.rect, w: Math.min(w, maxW), h: Math.min(h, maxH) } }
      }),
    }))
  },

  toggleCollapse: (id) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b)),
    }))
  },

  toggleFull: (id) => {
    get().checkpoint()
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
    }))
  },

  beginRename: (id) => set({ renamingId: id }),
  select: (id) => {
    const cur = get().selectedId
    if (cur === id) return
    set({ selectedId: id })
  },
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  createCustomType: (base) => {
    const s = get()
    if (s.customTypes.length >= 100) return ''
    const id = `u${s.seq}`
    const def = resolveDef(base, s.customTypes)
    get().checkpoint()
    set((st) => ({
      customTypes: [
        ...st.customTypes,
        { id, label: 'Новый тип', glyph: '◇', hint: '', base, w: def.w, h: def.h, blank: def.blank },
      ],
      seq: st.seq + 1,
    }))
    return id
  },

  updateCustomType: (id, patch) => {
    get().checkpoint()
    set((s) => ({
      customTypes: s.customTypes.map((t) => {
        if (t.id !== id) return t
        const next: CustomTypeDef = { ...t }
        if (patch.label !== undefined) {
          const label = patch.label.trim().slice(0, 100)
          if (label) next.label = label
        }
        if (patch.glyph !== undefined) {
          const g = patch.glyph.trim().slice(0, 2)
          next.glyph = g || '◇'
        }
        if (patch.hint !== undefined) next.hint = patch.hint.slice(0, 200)
        if (patch.base !== undefined && (['note', 'text', 'log', 'actions', 'blank'] as const).includes(patch.base)) {
          next.base = patch.base
        }
        if (patch.w !== undefined) next.w = Math.round(clamp(patch.w, 1, 8))
        if (patch.h !== undefined) next.h = Math.round(clamp(patch.h, 1, 8))
        if (patch.blank !== undefined) next.blank = patch.blank.slice(0, 50_000)
        return next
      }),
    }))
  },

  removeCustomType: (id) => {
    const t = get().customTypes.find((x) => x.id === id)
    if (!t) return
    get().checkpoint()
    set((s) => ({
      customTypes: s.customTypes.filter((x) => x.id !== id),
      // блоки не пропадают: переходят на базовый рендер типа
      blocks: s.blocks.map((b) => (b.kind === id ? { ...b, kind: t.base } : b)),
    }))
  },

  addPort: (blockId, dir, label) => {
    const s = get()
    const block = s.blocks.find((b) => b.id === blockId)
    if (!block || block.ports.length >= 200) return ''
    const id = `p${s.seq}`
    get().checkpoint()
    set((st) => ({
      blocks: st.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              ports: [
                ...b.ports,
                {
                  id,
                  label: (label ?? (dir === 'in' ? 'Вход' : 'Выход')).slice(0, 100) || 'Порт',
                  dir,
                  data: 'any' as const,
                },
              ],
            }
          : b,
      ),
      seq: st.seq + 1,
    }))
    return id
  },

  renamePort: (blockId, portId, label) => {
    const clean = label.trim().slice(0, 100)
    if (!clean) return
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) =>
        b.id === blockId
          ? { ...b, ports: b.ports.map((p) => (p.id === portId ? { ...p, label: clean } : p)) }
          : b,
      ),
    }))
  },

  removePort: (blockId, portId) => {
    get().checkpoint()
    set((s) => ({
      blocks: s.blocks.map((b) =>
        b.id === blockId ? { ...b, ports: b.ports.filter((p) => p.id !== portId) } : b,
      ),
      links: s.links.filter((l) => !(l.from.block === blockId && l.from.port === portId) && !(l.to.block === blockId && l.to.port === portId)),
    }))
  },

  addLink: (from, to) => {
    const s = get()
    if (s.links.length >= 2000) return null
    const dirOf = (block: string, port: string): 'in' | 'out' | null =>
      s.blocks.find((b) => b.id === block)?.ports.find((p) => p.id === port)?.dir ?? null
    // ворота: невалидный бросок не создаёт связь, а не создаёт проблему
    if (dirOf(from.block, from.port) !== 'out') return null
    if (dirOf(to.block, to.port) !== 'in') return null
    if (from.block === to.block && from.port === to.port) return null
    const pair = `${from.block}:${from.port}>${to.block}:${to.port}`
    if (s.links.some((l) => `${l.from.block}:${l.from.port}>${l.to.block}:${l.to.port}` === pair)) {
      return null
    }
    const id = `l${s.seq}`
    get().checkpoint()
    set((st) => ({
      links: [...st.links, { id, from: { ...from }, to: { ...to }, label: '' }],
      seq: st.seq + 1,
    }))
    return id
  },

  removeLink: (id) => {
    get().checkpoint()
    set((s) => ({ links: s.links.filter((l) => l.id !== id) }))
  },

  setLinkLabel: (id, label) => {
    get().checkpoint()
    set((s) => ({
      links: s.links.map((l) => (l.id === id ? { ...l, label: label.slice(0, 100) } : l)),
    }))
  },

  setCycleLimit: (n) => {
    get().checkpoint()
    set({ settings: { cycleLimit: Math.round(clamp(n, 1, 10000)) } })
  },

  setCanvas: (size) => {
    const cur = get().canvas
    if (cur.w === size.w && cur.h === size.h) return
    set({ canvas: size })
  },

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  clearWorkspace: () => {
    get().checkpoint()
    set({ blocks: [], links: [], renamingId: null, selectedId: null })
  },
  /** Очистить активную категорию — одна точка истории на все блоки. */
  clearCategory: () => {
    const s = get()
    if (!s.blocks.some((b) => b.category === s.activeCategory)) return
    get().checkpoint()
    set((st) => {
      const gone = new Set(st.blocks.filter((b) => b.category === st.activeCategory).map((b) => b.id))
      return {
        blocks: st.blocks.filter((b) => b.category !== st.activeCategory),
        links: st.links.filter((l) => !gone.has(l.from.block) && !gone.has(l.to.block)),
        renamingId: null,
        selectedId: null,
      }
    })
  },

  /** Загрузка раскладки с диска. Данные уже прошли sanitize(). */
  hydrate: (p, resetHistory = true) => {
    if (resetHistory) {
      past = []
      future = []
      syncHistoryStatus()
    }
    set((s) => ({
      railWidth: p.railWidth,
      railCollapsed: p.railCollapsed,
      showGrid: p.showGrid,
      panelOpen: p.panelOpen,
      activeCategory: p.activeCategory,
      categories: p.categories,
      customTypes: p.customTypes,
      blocks: p.blocks,
      links: p.links,
      settings: { ...p.settings },
      seq: p.seq,
      // правка названия при загрузке не должна начинаться сама
      renamingId: null,
      selectedId: null,
      canvas: s.canvas,
    }))
  },

  /** Срез состояния для записи на диск. */
  toPersisted: (): PersistedState => {
    const s = get()
    return {
      railWidth: s.railWidth,
      railCollapsed: s.railCollapsed,
      showGrid: s.showGrid,
      panelOpen: s.panelOpen,
      activeCategory: s.activeCategory,
      categories: s.categories,
      customTypes: s.customTypes,
      seq: s.seq,
      blocks: s.blocks,
      links: s.links,
      settings: { ...s.settings },
    }
  },

  checkpoint: () => {
    const body = JSON.stringify(get().toPersisted())
    // подряд идущие дубли не копим: переименование в то же имя,
    // коммит без изменений и подобные — не шаги истории
    if (past.length > 0 && JSON.stringify(past[past.length - 1]) === body) return
    past.push(JSON.parse(body) as PersistedState)
    if (past.length > HISTORY_CAP) past.shift()
    future = []
    syncHistoryStatus()
  },

  undo: () => {
    const cur = JSON.stringify(get().toPersisted())
    // пропускаем точки, совпадающие с текущим состоянием
    // (например, отмена перетаскивания после Esc)
    while (past.length > 0 && JSON.stringify(past[past.length - 1]) === cur) past.pop()
    const prev = past.pop()
    if (!prev) {
      syncHistoryStatus()
      return false
    }
    future.push(JSON.parse(cur) as PersistedState)
    get().hydrate(prev, false)
    syncHistoryStatus()
    return true
  },

  redo: () => {
    const next = future.pop()
    if (!next) {
      syncHistoryStatus()
      return false
    }
    past.push(JSON.parse(JSON.stringify(get().toPersisted())) as PersistedState)
    get().hydrate(next, false)
    syncHistoryStatus()
    return true
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
