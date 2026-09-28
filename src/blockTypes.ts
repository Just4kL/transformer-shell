import { MAJOR } from './grid'

/**
 * Реестр типов блоков. Фаза А: реестр открыт для пользователя.
 *
 * Встроенные типы (`BuiltinKind`) — единственные, у которых есть свой
 * рендер в `BlockBody`. Пользовательский тип НЕ добавляет рендер:
 * он переиспользует один из встроенных через поле `base`, а сам задаёт
 * оформление: название, значок, подсказку, габарит и начальное содержимое.
 *
 * Пример: «Кнопки сборки» — это `base: 'actions'` с собственным именем
 * и значком. Так «лего» собирается без единой строчки кода.
 */

export type BuiltinKind = 'note' | 'text' | 'log' | 'actions' | 'blank'

/** Вид блока: встроенное имя либо id пользовательского типа (`u_12`). */
export type BlockKind = string

export const BUILTINS: readonly BuiltinKind[] = ['note', 'text', 'log', 'actions', 'blank']

export const isBuiltin = (kind: string): kind is BuiltinKind =>
  (BUILTINS as readonly string[]).includes(kind)

export interface BlockDef {
  kind: BuiltinKind
  /** Название типа в меню — «что он будет показывать». */
  label: string
  hint: string
  glyph: string
  /** Габарит нового блока в больших квадратах. */
  w: number
  h: number
  blank: string
}

/** Пользовательский тип блока — оформление поверх встроенного рендера. */
export interface CustomTypeDef {
  /** Идентификатор вида `u_12`. */
  id: string
  label: string
  glyph: string
  hint: string
  /** Какой встроенный рендер использовать для отображения. */
  base: BuiltinKind
  /** Габарит новых блоков в больших квадратах. */
  w: number
  h: number
  /** Начальное содержимое новых блоков. */
  blank: string
}

/** Тип блока, приведённый к полному виду — чем рисовать и как назвать. */
export interface ResolvedDef {
  label: string
  glyph: string
  hint: string
  w: number
  h: number
  blank: string
  /** Итоговый рендер. */
  base: BuiltinKind
  /** true — пользовательский тип, false — встроенный. */
  custom: boolean
}

export const BLOCK_DEFS: readonly BlockDef[] = [
  {
    kind: 'note',
    label: 'Заметка',
    hint: 'Markdown-текст, рендерится вживую',
    glyph: '✎',
    w: 2,
    h: 3,
    blank: '# Новая заметка\n\nПиши здесь. **Жирный**, *курсив*, `код`.\n\n- пункт списка\n- ещё пункт',
  },
  {
    kind: 'text',
    label: 'Текст',
    hint: 'Обычный текст без разметки',
    glyph: '¶',
    w: 2,
    h: 2,
    blank: 'Свободный текст без разметки.',
  },
  {
    kind: 'log',
    label: 'Журнал / вывод',
    hint: 'Моноширинный поток, только чтение',
    glyph: '≡',
    w: 2,
    h: 2,
    blank: '[00:00:00] оболочка запущена\n[00:00:00] сетка: малая 8px / большая 64px',
  },
  {
    kind: 'actions',
    label: 'Действия',
    hint: 'Кнопки и элементы управления',
    glyph: '⌘',
    w: 2,
    h: 2,
    blank: 'собрать\nочистить\nэкспорт',
  },
  {
    kind: 'blank',
    label: 'Заглушка',
    hint: 'Пустой блок-контейнер',
    glyph: '□',
    w: 1,
    h: 1,
    blank: '',
  },
] as const

const BY_KIND = new Map<string, BlockDef>(BLOCK_DEFS.map((d) => [d.kind, d]))

/**
 * Приводит вид блока к полному виду. Неизвестный вид (например, тип,
 * удалённый после сохранения) безопасно превращается в заглушку —
 * блок не пропадает, содержимое не теряется.
 */
export function resolveDef(kind: string, customs: readonly CustomTypeDef[]): ResolvedDef {
  const builtin = BY_KIND.get(kind)
  if (builtin) {
    return { ...builtin, base: builtin.kind, custom: false }
  }
  const custom = customs.find((c) => c.id === kind)
  if (custom && BY_KIND.has(custom.base)) {
    return {
      label: custom.label,
      glyph: custom.glyph,
      hint: custom.hint,
      w: custom.w,
      h: custom.h,
      blank: custom.blank,
      base: custom.base,
      custom: true,
    }
  }
  const blank = BY_KIND.get('blank') as BlockDef
  return { ...blank, base: 'blank' as BuiltinKind, custom: false }
}

/** Только рендер — для выбора тела блока. */
export const resolveBase = (kind: string, customs: readonly CustomTypeDef[]): BuiltinKind =>
  resolveDef(kind, customs).base

export const defaultSize = (kind: string, customs: readonly CustomTypeDef[] = []): { w: number; h: number } => {
  const d = resolveDef(kind, customs)
  return { w: d.w * MAJOR, h: d.h * MAJOR }
}

/** Совместимость: определение встроенного типа по имени. */
export const getBlockDef = (kind: BuiltinKind): BlockDef =>
  BY_KIND.get(kind) ?? (BY_KIND.get('blank') as BlockDef)
