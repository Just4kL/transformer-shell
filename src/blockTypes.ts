import { MAJOR } from './grid'

export type BlockKind = 'note' | 'text' | 'log' | 'actions' | 'blank'

export interface BlockDef {
  kind: BlockKind
  /** Название типа в меню — «что он будет показывать». */
  label: string
  hint: string
  glyph: string
  /** Габарит нового блока в больших квадратах. */
  w: number
  h: number
  blank: string
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

const BY_KIND = new Map<BlockKind, BlockDef>(BLOCK_DEFS.map((d) => [d.kind, d]))

export const getBlockDef = (kind: BlockKind): BlockDef =>
  BY_KIND.get(kind) ?? BLOCK_DEFS[0]

export const defaultSize = (kind: BlockKind): { w: number; h: number } => {
  const d = getBlockDef(kind)
  return { w: d.w * MAJOR, h: d.h * MAJOR }
}
