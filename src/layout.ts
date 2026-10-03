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
 *
 * v3: порты на блоках, связи плоским списком, настройки (лимит циклов).
 * Проект — в docs/links-schema.md.
 *
 * v4: шаблоны — именованные снимки документа целиком. Хранятся в том же
 * файле (отдельный файл = новый мост и второй источник правды, а бэкап
 * удобнее одним файлом). Вложенность запрещена: шаблон внутри шаблона
 * не хранится, иначе размер растёт экспоненциально.
 */

export const LAYOUT_VERSION = 4

/** Предохранители, чтобы файл не мог вырасти до бесконечности. */
const MAX_BLOCKS = 500
const MAX_CONTENT = 200_000
const MAX_CATEGORIES = 100
const MAX_CUSTOM_TYPES = 100
const MAX_TYPE_BLANK = 50_000
const MAX_PORTS = 200
const MAX_LINKS = 2000
const MAX_TEMPLATES = 20

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
  /** Гнезда блока. У новых блоков — сразу пара «вход/выход». */
  ports: Port[]
}

export interface Category {
  id: string
  label: string
  glyph: string
}

/** Гнездо на экземпляре блока. Тип данных один — 'any' («поток»). */
export interface Port {
  id: string
  label: string
  dir: 'in' | 'out'
  data: 'any'
}

export interface LinkEndpoint {
  block: string
  port: string
}

/** Связь: выход одного порта на вход другого. Категория не участвует. */
export interface Link {
  id: string
  from: LinkEndpoint
  to: LinkEndpoint
  label: string
}

/** Настройки раскладки. Пока один лимит — на итерации при циклах. */
export interface LayoutSettings {
  cycleLimit: number
}

export const DEFAULT_SETTINGS: LayoutSettings = { cycleLimit: 100 }

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
  /** Связи между портами, плоским списком. */
  links: Link[]
  settings: LayoutSettings
  /**
   * Шаблоны: имя -> снимок документа. Снимок — полный PersistedState,
   * но БЕЗ вложенных шаблонов (иначе размер растёт экспоненциально).
   */
  templates: Record<string, PersistedState>
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

/** Гнездо блока. id уникален глобально — так проще и безопаснее. */
function readPort(v: unknown, taken: Set<string>): Port | null {
  if (!isObj(v)) return null
  const id = str(v.id, '', 50)
  if (!id || taken.has(id)) return null
  if (v.dir !== 'in' && v.dir !== 'out') return null
  taken.add(id)
  return { id, label: str(v.label, 'Порт', 100), dir: v.dir, data: 'any' }
}

function readEndpoint(v: unknown): LinkEndpoint | null {
  if (!isObj(v)) return null
  const block = str(v.block, '', 100)
  const port = str(v.port, '', 50)
  if (!block || !port) return null
  return { block, port }
}

/**
 * Связь из файла. Структурно битые (концы не разрешаются, направления
 * перепутаны, петля в тот же порт, дубликат пары) — отбрасываются:
 * рисовать нечего, а данные блоков при этом не страдают.
 */
function readLink(
  v: unknown,
  takenIds: Set<string>,
  seenPairs: Set<string>,
  portDir: (block: string, port: string) => 'in' | 'out' | null,
  nextId: () => string,
): Link | null {
  if (!isObj(v)) return null
  const from = readEndpoint(v.from)
  const to = readEndpoint(v.to)
  if (!from || !to) return null
  if (from.block === to.block && from.port === to.port) return null
  if (portDir(from.block, from.port) !== 'out') return null
  if (portDir(to.block, to.port) !== 'in') return null
  const pair = `${from.block}:${from.port}>${to.block}:${to.port}`
  if (seenPairs.has(pair)) return null
  seenPairs.add(pair)

  let id = str(v.id, '', 50)
  if (!id || takenIds.has(id)) id = nextId()
  takenIds.add(id)
  return { id, from, to, label: str(v.label, '', 100) }
}

function readSettings(v: unknown): LayoutSettings {
  const o = isObj(v) ? v : {}
  return { cycleLimit: Math.round(clamp(num(o.cycleLimit, DEFAULT_SETTINGS.cycleLimit), 1, 10000)) }
}

// ── основная проверка ───────────────────────────────────────────────────────

/**
 * Превращает произвольные данные из файла в валидное состояние.
 * Возвращает null, если восстановить нечего — тогда приложение
 * стартует с пустой раскладки, а не падает.
 */
export function sanitize(raw: unknown, depth = 0): PersistedState | null {
  if (depth > 5) return null // матрешка из шаблонов: дальше не разбираем
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
  const takenPortIds = new Set<string>()
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

      const ports: Port[] = []
      if (Array.isArray(b.ports)) {
        for (const p of b.ports.slice(0, MAX_PORTS)) {
          const port = readPort(p, takenPortIds)
          if (port) ports.push(port)
        }
      }

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
        ports,
      })
    }
  }

  // связи — после блоков: концы обязаны разрешаться в прочитанные порты
  const portDir = (block: string, port: string): 'in' | 'out' | null => {
    const b = blocks.find((x) => x.id === block)
    return b?.ports.find((p) => p.id === port)?.dir ?? null
  }
  const links: Link[] = []
  const takenLinkIds = new Set<string>()
  const seenPairs = new Set<string>()
  let restoreLink = 0
  if (Array.isArray(state.links)) {
    for (const l of state.links.slice(0, MAX_LINKS)) {
      const link = readLink(l, takenLinkIds, seenPairs, portDir, () => `l_restore_${restoreLink++}`)
      if (link) links.push(link)
    }
  }

  const settings = readSettings(state.settings)

  // шаблоны: каждый — либо конверт {version, state} (так пишут руки),
  // либо голое состояние (так пишет saveTemplate). Голое заворачиваем
  // в текущую версию: его писал код этой же версии, полей из будущего
  // там быть не может. Проверяется тем же sanitize рекурсивно.
  const templates: Record<string, PersistedState> = {}
  if (isObj(state.templates)) {
    for (const [name, raw] of Object.entries(state.templates).slice(0, MAX_TEMPLATES)) {
      const cleanName = name.slice(0, 100).trim()
      if (!cleanName || templates[cleanName] !== undefined) continue
      const envelope =
        isObj(raw) && isObj((raw as Record<string, unknown>).state)
          ? raw
          : { version: LAYOUT_VERSION, savedAt: '', state: raw }
      const inner = sanitize(envelope, depth + 1)
      if (inner) templates[cleanName] = { ...inner, templates: {} }
    }
  }

  // счётчик идентификаторов — обязан быть больше всего, что уже занято.
  // Сканируем блоки, типы, порты и связи: счётчик общий.
  let highest = 0
  const scanSeq = (id: string) => {
    const m = /(\d+)$/.exec(id)
    if (m) highest = Math.max(highest, Number(m[1]))
  }
  for (const id of seen) scanSeq(id)
  for (const t of customTypes) scanSeq(t.id)
  for (const p of takenPortIds) scanSeq(p)
  for (const l of takenLinkIds) scanSeq(l)
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
    links,
    settings,
    templates,
  }
}
