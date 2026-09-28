import { BLOCK_MIN, MAJOR, RAIL_MAX, RAIL_MIN, UNIT, clamp, snap } from './grid'
import { BLOCK_DEFS, isBuiltin, type BlockKind, type CustomTypeDef } from './blockTypes'

/**
 * Схема сохраняемой раскладки.
 *
 * Файл на диске — внешние данные, которым нельзя доверять: его могли
 * править руками, он мог остаться от другой версии программы или
 * побиться при аварийном закрытии. Поэтому всё, что читается, проходит
 * через sanitize(): неизвестное отбрасывается, числа зажимаются в
 * допустимые пределы, битые блоки выбрасываются целиком.
 *
 * Модуль ничего не импортирует из store.ts — зависимость односторонняя,
 * иначе получился бы цикл.
 */

export const LAYOUT_VERSION = 2

/** Предохранители, чтобы файл не мог вырасти до бесконечности. */
const MAX_BLOCKS = 500
const MAX_CONTENT = 200_000
const MAX_CATEGORIES = 100
const MAX_CUSTOM_TYPES = 100
const MAX_TYPE_BLANK = 50_000

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

/** Ровно те поля состояния, которые имеет смысл переживать перезапуск. */
export interface PersistedState {
  railWidth: number
  railCollapsed: boolean
  showGrid: boolean
  /** Панель свойств справа открыта. */
  panelOpen: boolean
  activeCategory: string
  categories: Category[]
  /** Пользовательские типы блоков. */
  customTypes: CustomTypeDef[]
  seq: number
  blocks: Block[]
}

// ── примитивы проверки ──────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

const str = (v: unknown, fallback: string, max = 500): string =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : fallback

function readKind(v: unknown, customs: readonly CustomTypeDef[]): BlockKind {
  if (typeof v !== 'string' || v.length === 0) return 'blank'
  if (isBuiltin(v)) return v
  // пользовательский тип обязан существовать — иначе блок станет заглушкой
  // при отображении, но сам вид сохраняем, чтобы не терять данные
  if (customs.some((c) => c.id === v)) return v
  return 'blank'
}

/** Пользовательский тип из файла: проверяем каждое поле. */
function readCustomType(v: unknown, taken: Set<string>): CustomTypeDef | null {
  if (!isObj(v)) return null
  const id = str(v.id, '', 50)
  // id обязан быть уникальным и не пересекаться со встроенными именами
  if (!id || taken.has(id) || isBuiltin(id)) return null
  const baseRaw = v.base
  if (typeof baseRaw !== 'string' || !isBuiltin(baseRaw)) return null
  taken.add(id)
  return {
    id,
    label: str(v.label, 'Тип', 100),
    glyph: str(v.glyph, '◇', 4) || '◇',
    hint: str(v.hint, '', 200),
    base: baseRaw,
    w: Math.round(clamp(num(v.w, 2), 1, 8)),
    h: Math.round(clamp(num(v.h, 2), 1, 8)),
    blank: typeof v.blank === 'string' ? v.blank.slice(0, MAX_TYPE_BLANK) : '',
  }
}

/** Прямоугольник приводим к сетке и к положительным размерам. */
function readRect(v: unknown): Rect {
  const o = isObj(v) ? v : {}
  return {
    x: Math.max(0, snap(num(o.x, MAJOR), UNIT)),
    y: Math.max(0, snap(num(o.y, MAJOR), UNIT)),
    w: Math.max(BLOCK_MIN, snap(num(o.w, MAJOR * 2), UNIT)),
    h: Math.max(BLOCK_MIN, snap(num(o.h, MAJOR * 2), UNIT)),
  }
}

// ── основная проверка ───────────────────────────────────────────────────────

/**
 * Превращает произвольные данные из файла в валидное состояние.
 * Возвращает null, если восстановить нечего — тогда приложение
 * стартует с пустой раскладки, а не падает.
 */
export function sanitize(raw: unknown): PersistedState | null {
  const root = isObj(raw) ? raw : null
  if (!root) return null

  // файл из более новой версии программы — не трогаем
  const version = num(root.version, LAYOUT_VERSION)
  if (version > LAYOUT_VERSION) {
    console.warn(`[layout] файл версии ${version}, программа знает только ${LAYOUT_VERSION}`)
    return null
  }

  const state = isObj(root.state) ? root.state : null
  if (!state) return null

  // категории
  const categories: Category[] = []
  if (Array.isArray(state.categories)) {
    for (const c of state.categories.slice(0, MAX_CATEGORIES)) {
      if (!isObj(c)) continue
      const id = str(c.id, '', 100)
      if (!id || categories.some((x) => x.id === id)) continue
      categories.push({ id, label: str(c.label, id, 100), glyph: str(c.glyph, '◇', 4) })
    }
  }
  const cats = categories.length > 0 ? categories : [...DEFAULT_CATEGORIES]
  const catIds = new Set(cats.map((c) => c.id))

  // пользовательские типы блоков (новое в v2; в файлах v1 их нет — и это нормально)
  const customTypes: CustomTypeDef[] = []
  const takenTypeIds = new Set<string>()
  if (Array.isArray(state.customTypes)) {
    for (const t of state.customTypes.slice(0, MAX_CUSTOM_TYPES)) {
      const def = readCustomType(t, takenTypeIds)
      if (def) customTypes.push(def)
    }
  }

  // блоки
  const blocks: Block[] = []
  const seen = new Set<string>()
  if (Array.isArray(state.blocks)) {
    for (const b of state.blocks.slice(0, MAX_BLOCKS)) {
      if (!isObj(b)) continue

      const kind = readKind(b.kind, customTypes)
      const label = isBuiltin(kind)
        ? (BLOCK_DEFS.find((d) => d.kind === kind)?.label ?? 'Блок')
        : (customTypes.find((c) => c.id === kind)?.label ?? 'Блок')

      let id = str(b.id, '', 100)
      if (!id || seen.has(id)) {
        // битый или повторяющийся идентификатор — выдаём новый
        id = `b_restore_${blocks.length}`
        let n = blocks.length
        while (seen.has(id)) id = `b_restore_${n++}`
      }
      seen.add(id)

      blocks.push({
        id,
        kind,
        title: str(b.title, label, 200),
        category: catIds.has(str(b.category, '', 100)) ? (b.category as string) : (cats[0].id as string),
        rect: readRect(b.rect),
        savedRect: b.savedRect == null ? null : readRect(b.savedRect),
        collapsed: bool(b.collapsed, false),
        expanded: b.expanded === 'full' ? 'full' : 'normal',
        content: typeof b.content === 'string' ? b.content.slice(0, MAX_CONTENT) : '',
      })
    }
  }

  // счётчик идентификаторов — обязан быть больше всего, что уже занято.
  // Сканируем и блоки (`b12`, `b_restore_3`), и типы (`u7`): счётчик общий.
  let highest = 0
  const scanSeq = (id: string) => {
    const m = /(\d+)$/.exec(id)
    if (m) highest = Math.max(highest, Number(m[1]))
  }
  for (const id of seen) scanSeq(id)
  for (const t of customTypes) scanSeq(t.id)
  const seq = Math.max(num(state.seq, highest + 1), highest + 1)

  const activeRaw = str(state.activeCategory, '', 100)
  const activeCategory = catIds.has(activeRaw) ? activeRaw : (cats[0].id as string)

  return {
    railWidth: clamp(snap(num(state.railWidth, RAIL_MIN), MAJOR), RAIL_MIN, RAIL_MAX),
    railCollapsed: bool(state.railCollapsed, false),
    showGrid: bool(state.showGrid, true),
    panelOpen: bool(state.panelOpen, true),
    activeCategory,
    categories: cats,
    customTypes,
    seq: Math.floor(seq),
    blocks,
  }
}
