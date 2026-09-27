import { BLOCK_DEFS, type BlockKind } from '../blockTypes'
import type { Block } from '../store'
import { sep, type MenuItem } from './menu'

/**
 * Меню блока: назвать, сменить содержимое, перенести, свернуть/развернуть,
 * удалить. Вынесено отдельным модулем, чтобы в файле компонента остались
 * только компоненты — иначе ломается Fast Refresh.
 */
export function blockMenuItems(
  block: Block,
  actions: {
    rename: () => void
    setKind: (k: BlockKind) => void
    moveTo: (c: string) => void
    collapse: () => void
    full: () => void
    remove: () => void
  },
  categories: readonly { id: string; label: string; glyph: string }[],
): MenuItem[] {
  return [
    { id: 'rename', label: 'Назвать блок…', glyph: '✎', onSelect: actions.rename },
    {
      id: 'kind',
      label: 'Будет показывать',
      glyph: '▤',
      children: BLOCK_DEFS.map((d) => ({
        id: `kind-${d.kind}`,
        label: d.label,
        hint: d.hint,
        glyph: d.glyph,
        checked: d.kind === block.kind,
        onSelect: () => actions.setKind(d.kind),
      })),
    },
    {
      id: 'move',
      label: 'Перенести в категорию',
      glyph: '⇄',
      children: categories.map((c) => ({
        id: `cat-${c.id}`,
        label: c.label,
        glyph: c.glyph,
        checked: c.id === block.category,
        onSelect: () => actions.moveTo(c.id),
      })),
    },
    sep('sep1'),
    {
      id: 'collapse',
      label: block.collapsed ? 'Развернуть содержимое' : 'Свернуть до квадрата',
      glyph: block.collapsed ? '▸' : '▾',
      onSelect: actions.collapse,
    },
    {
      id: 'full',
      label: block.expanded === 'full' ? 'Вернуть в сетку' : 'Развернуть на всё поле',
      glyph: '⤢',
      onSelect: actions.full,
    },
    sep('sep2'),
    { id: 'remove', label: 'Удалить блок', glyph: '✕', danger: true, onSelect: actions.remove },
  ]
}
