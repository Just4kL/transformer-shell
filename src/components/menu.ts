/** Типы и хелперы контекстного меню — отдельно от компонента,
 *  иначе Vite не может делать Fast Refresh для этого модуля. */

export interface MenuItem {
  id: string
  label: string
  glyph?: string
  hint?: string
  separator?: boolean
  disabled?: boolean
  checked?: boolean
  danger?: boolean
  children?: MenuItem[]
  onSelect?: () => void
}

export interface MenuRequest {
  x: number
  y: number
  items: MenuItem[]
}

/** Разделитель меню. */
export const sep = (id: string): MenuItem => ({ id, label: '', separator: true })
