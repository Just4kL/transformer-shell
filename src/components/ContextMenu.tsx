import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MenuItem, MenuRequest } from './menu'

const MENU_W = 248
const ROW_H = 28

export function ContextMenu({ request, onClose }: { request: MenuRequest; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: request.x, top: request.y, ready: false })
  const [openSub, setOpenSub] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(request.x, window.innerWidth - width - 8)
    const top =
      request.y + height > window.innerHeight - 8 ? Math.max(8, request.y - height) : request.y
    setPos({ left, top, ready: true })
  }, [request.x, request.y])

  // новое контекстное меню — подменю должны быть закрыты
  useEffect(() => {
    setOpenSub(null)
  }, [request])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // capture-фаза: не даём меню закрыться тем же кликом, что его открыл
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={hostRef}
      className="ctx"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      role="menu"
    >
      {request.items.map((item) => (
        <MenuRow
          key={item.id}
          item={item}
          open={openSub === item.id}
          onOpen={() => setOpenSub(item.id)}
          onCloseSub={() => setOpenSub(null)}
          onPick={() => {
            onClose()
            item.onSelect?.()
          }}
        />
      ))}
    </div>,
    document.body,
  )
}

function MenuRow({
  item,
  open,
  onOpen,
  onCloseSub,
  onPick,
}: {
  item: MenuItem
  open: boolean
  onOpen: () => void
  onCloseSub: () => void
  onPick: () => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !rowRef.current) {
      setSubPos(null)
      return
    }
    const r = rowRef.current.getBoundingClientRect()
    const flipX = r.right + MENU_W + 8 > window.innerWidth
    const flipY = r.bottom + ROW_H * (item.children?.length ?? 0) + 16 > window.innerHeight
    setSubPos({
      left: flipX ? r.left - MENU_W + 2 : r.right - 2,
      top: flipY ? r.top - 4 : r.bottom - 4,
    })
  }, [open, item.children])

  if (item.separator) return <div className="ctx-sep" />

  return (
    <>
      <div
        ref={rowRef}
        className={[
          'ctx-row',
          item.disabled ? 'is-disabled' : '',
          item.danger ? 'is-danger' : '',
          open ? 'is-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerOver={(e) => {
          // React синтезирует onPointerEnter из pointerover
          if ((e.target as HTMLElement).closest('.ctx-row') !== e.currentTarget) return
          if (item.children) onOpen()
          else onCloseSub()
        }}
        onClick={() => {
          if (item.disabled || item.children) return
          onPick()
        }}
        role="menuitem"
      >
        <span className="ctx-glyph">{item.glyph ?? ''}</span>
        <span className="ctx-label">{item.label}</span>
        {item.hint && <span className="ctx-hint">{item.hint}</span>}
        {item.checked && <span className="ctx-check">✓</span>}
        {item.children && <span className="ctx-caret">›</span>}
      </div>

      {/* подменю рендерим внутри контейнера (position: fixed), иначе клик
          по нему считался бы «вне меню» и закрыл бы его */}
      {open && subPos && item.children && (
        <div className="ctx ctx-sub" style={{ left: subPos.left, top: subPos.top }} role="menu">
          {item.children.map((child) => (
            <MenuRow
              key={child.id}
              item={child}
              open={false}
              onOpen={() => undefined}
              onCloseSub={() => undefined}
              onPick={() => {
                onPick()
                child.onSelect?.()
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
