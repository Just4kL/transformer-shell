import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { useShell, type Block } from '../store'

/** Тело блока: содержимое определяется типом, выбранным в контекстном меню.
 *  Редактирование — двойным кликом по телу. */
export function BlockBody({ block }: { block: Block }) {
  switch (block.kind) {
    case 'note':
      return <NoteBody block={block} />
    case 'text':
      return <TextBody block={block} />
    case 'log':
      return <LogBody block={block} />
    case 'actions':
      return <ActionsBody block={block} />
    case 'blank':
    default:
      return (
        <div className="b-body b-blank">
          <span>свободный блок</span>
        </div>
      )
  }
}

/** Локальный черновик содержимого: коммитится в стор при выходе из режима. */
function useDraft(block: Block) {
  const setContent = useShell((s) => s.setContent)
  const [value, setValue] = useState(block.content)
  const dirty = useRef(false)

  useEffect(() => {
    if (!dirty.current) setValue(block.content)
  }, [block.content])

  const commit = () => {
    if (dirty.current) setContent(block.id, value)
    dirty.current = false
  }

  return {
    value,
    setValue: (v: string) => {
      dirty.current = true
      setValue(v)
    },
    commit,
  }
}

/* ---------------------------- заметка (Markdown) ---------------------------- */

function NoteBody({ block }: { block: Block }) {
  const { value, setValue, commit } = useDraft(block)
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const nodes = useMemo(() => renderMarkdown(value), [value])

  useEffect(() => {
    if (mode === 'read') commit()
  }, [mode, commit])

  if (mode === 'read') {
    return (
      <div className="b-body b-md" onDoubleClick={() => setMode('edit')}>
        {nodes.length > 0 ? (
          nodes
        ) : (
          <p className="b-empty">
            Пусто. Двойной клик — редактировать. <code>*Markdown*</code>, <code># заголовок</code>,{' '}
            <code>- список</code>.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="b-body b-editor">
      <textarea
        ref={areaRef}
        className="b-textarea"
        value={value}
        spellCheck={false}
        placeholder="# Заголовок&#10;&#10;Текст заметки"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setMode('read')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            e.currentTarget.blur()
          }
        }}
      />
      <div className="b-editor-bar">
        <span>markdown</span>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('read')}>
          готово
        </button>
      </div>
    </div>
  )
}

/* ------------------------------- простой текст ----------------------------- */

function TextBody({ block }: { block: Block }) {
  const { value, setValue, commit } = useDraft(block)
  const [mode, setMode] = useState<'read' | 'edit'>('read')

  useEffect(() => {
    if (mode === 'read') commit()
  }, [mode, commit])

  if (mode === 'read') {
    return (
      <div className="b-body b-text" onDoubleClick={() => setMode('edit')}>
        {value.trim() ? (
          value
        ) : (
          <span className="b-empty">Пусто. Двойной клик — редактировать.</span>
        )}
      </div>
    )
  }

  return (
    <div className="b-body b-editor">
      <textarea
        className="b-textarea"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setMode('read')}
      />
      <div className="b-editor-bar">
        <span>текст</span>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('read')}>
          готово
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ журнал / вывод ----------------------------- */

function LogBody({ block }: { block: Block }) {
  const lines = useMemo(() => block.content.split('\n'), [block.content])
  return (
    <div className="b-body b-log">
      {lines.map((l, i) => (
        <div className="b-log-line" key={i}>
          {l || '\u00a0'}
        </div>
      ))}
    </div>
  )
}

/* --------------------------------- действия -------------------------------- */

function ActionsBody({ block }: { block: Block }) {
  const [hits, setHits] = useState<Record<string, number>>({})
  const items = useMemo(
    () =>
      block.content
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [block.content],
  )

  if (items.length === 0) {
    return <div className="b-body b-blank">Список действий пуст</div>
  }

  return (
    <div className="b-body b-actions">
      {items.map((name) => (
        <button
          key={name}
          className="b-action"
          onClick={() => setHits((h) => ({ ...h, [name]: (h[name] ?? 0) + 1 }))}
        >
          <span className="b-action-glyph">▸</span>
          <span className="b-action-name">{name}</span>
          {hits[name] ? <span className="b-action-badge">{hits[name]}</span> : null}
        </button>
      ))}
    </div>
  )
}
