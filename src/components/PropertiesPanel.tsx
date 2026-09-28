import { useEffect, useState } from 'react'
import { MAJOR } from '../grid'
import { BUILTINS, resolveDef } from '../blockTypes'
import { useShell, type Block, type CustomTypeDef } from '../store'

/** Ширина панели — 4 больших квадрата, как и положено полке. */
export const PANEL_W = MAJOR * 4

/**
 * Панель свойств — правая колонка конструктора.
 * Показывает выбранный блок: название, тип, категорию, размер, состояние.
 * Если тип пользовательский — здесь же его оформление: имя, значок,
 * базовый рендер, габарит и начальное содержимое новых блоков.
 */
export function PropertiesPanel() {
  const open = useShell((s) => s.panelOpen)
  const togglePanel = useShell((s) => s.togglePanel)
  const block = useShell((s) => s.blocks.find((b) => b.id === s.selectedId) ?? null)
  const blocksCount = useShell((s) => s.blocks.length)
  const typesCount = useShell((s) => s.customTypes.length)

  return (
    <aside className={open ? 'panel' : 'panel is-collapsed'} style={{ width: open ? PANEL_W : 0 }}>
      <div className="panel-head">
        <span className="panel-title">Свойства</span>
        <button className="panel-collapse" onClick={togglePanel} title="Скрыть панель ( ] )">
          ›
        </button>
      </div>

      <div className="panel-body">
        {block ? <BlockProps key={block.id} block={block} /> : <EmptyProps blocks={blocksCount} types={typesCount} />}
      </div>
    </aside>
  )
}

function EmptyProps({ blocks, types }: { blocks: number; types: number }) {
  return (
    <div className="panel-empty">
      <p>Выберите блок на поле — здесь появятся его свойства.</p>
      <p className="panel-stat">
        блоков: {blocks} · своих типов: {types}
      </p>
      <p className="panel-hint">Свои типы создаются из меню поля: «Новый тип блока…».</p>
    </div>
  )
}

function BlockProps({ block }: { block: Block }) {
  const customs = useShell((s) => s.customTypes)
  const categories = useShell((s) => s.categories)
  const renameBlock = useShell((s) => s.renameBlock)
  const changeKind = useShell((s) => s.changeKind)
  const moveToCategory = useShell((s) => s.moveToCategory)
  const nudgeSize = useShell((s) => s.nudgeSize)
  const toggleCollapse = useShell((s) => s.toggleCollapse)
  const toggleFull = useShell((s) => s.toggleFull)
  const removeBlock = useShell((s) => s.removeBlock)
  const updateCustomType = useShell((s) => s.updateCustomType)
  const removeCustomType = useShell((s) => s.removeCustomType)

  const def = resolveDef(block.kind, customs)
  const custom = customs.find((t) => t.id === block.kind) ?? null

  return (
    <>
      <Section title="Блок">
        <TextRow
          label="Название"
          value={block.title}
          onCommit={(v) => {
            if (v.trim() && v.trim() !== block.title) renameBlock(block.id, v)
          }}
        />
        <label className="prop-row">
          <span className="prop-label">Показывает</span>
          <select
            className="prop-select"
            value={block.kind}
            onChange={(e) => changeKind(block.id, e.target.value)}
          >
            <optgroup label="Встроенные">
              {BUILTINS.map((k) => {
                const d = resolveDef(k, customs)
                return (
                  <option key={k} value={k}>
                    {d.glyph} {d.label}
                  </option>
                )
              })}
            </optgroup>
            {customs.length > 0 && (
              <optgroup label="Свои типы">
                {customs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.glyph} {t.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="prop-row">
          <span className="prop-label">Категория</span>
          <select
            className="prop-select"
            value={block.category}
            onChange={(e) => moveToCategory(block.id, e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.glyph} {c.label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Размер">
        <div className="prop-row">
          <span className="prop-label">
            {Math.round(block.rect.w / MAJOR)}◆ × {Math.round(block.rect.h / MAJOR)}◆
          </span>
          <span className="prop-stepper">
            <button title="Уже по ширине" onClick={() => nudgeSize(block.id, -1, 0)}>
              −
            </button>
            <span>W</span>
            <button title="Шире" onClick={() => nudgeSize(block.id, 1, 0)}>
              +
            </button>
          </span>
        </div>
        <div className="prop-row">
          <span className="prop-label">
            {block.rect.w} × {block.rect.h} px
          </span>
          <span className="prop-stepper">
            <button title="Ниже по высоте" onClick={() => nudgeSize(block.id, 0, -1)}>
              −
            </button>
            <span>H</span>
            <button title="Выше" onClick={() => nudgeSize(block.id, 0, 1)}>
              +
            </button>
          </span>
        </div>
      </Section>

      <Section title="Вид">
        <div className="prop-row prop-buttons">
          <button className="prop-btn" onClick={() => toggleCollapse(block.id)}>
            {block.collapsed ? 'Развернуть' : 'Свернуть'}
          </button>
          <button className="prop-btn" onClick={() => toggleFull(block.id)}>
            {block.expanded === 'full' ? 'В сетку' : 'На всё поле'}
          </button>
        </div>
        <div className="prop-row prop-buttons">
          <button
            className="prop-btn is-danger"
            onClick={() => removeBlock(block.id)}
            title="Можно отменить через Ctrl+Z"
          >
            Удалить блок
          </button>
        </div>
      </Section>

      {custom && (
        <TypeEditor
          type={custom}
          onPatch={(patch) => updateCustomType(custom.id, patch)}
          onDelete={() => removeCustomType(custom.id)}
        />
      )}

      {!custom && (
        <p className="panel-hint">
          Тип «{def.label}» встроенный. Свой тип с таким же содержимым — из меню поля: «Новый тип
          блока…».
        </p>
      )}
    </>
  )
}

function TypeEditor({
  type,
  onPatch,
  onDelete,
}: {
  type: CustomTypeDef
  onPatch: (patch: Partial<Omit<CustomTypeDef, 'id'>>) => void
  onDelete: () => void
}) {
  return (
    <Section title="Свой тип">
      <TextRow
        label="Название"
        value={type.label}
        onCommit={(v) => {
          if (v.trim() && v.trim() !== type.label) onPatch({ label: v })
        }}
      />
      <TextRow
        label="Значок"
        value={type.glyph}
        maxLength={2}
        onCommit={(v) => {
          if (v.trim() && v.trim() !== type.glyph) onPatch({ glyph: v })
        }}
      />
      <TextRow
        label="Подсказка"
        value={type.hint}
        onCommit={(v) => {
          if (v !== type.hint) onPatch({ hint: v })
        }}
      />
      <label className="prop-row">
        <span className="prop-label">Основа</span>
        <select
          className="prop-select"
          value={type.base}
          onChange={(e) => onPatch({ base: e.target.value as CustomTypeDef['base'] })}
        >
          {BUILTINS.map((k) => {
            const d = resolveDef(k, [])
            return (
              <option key={k} value={k}>
                {d.glyph} {d.label}
              </option>
            )
          })}
        </select>
      </label>
      <div className="prop-row">
        <span className="prop-label">Габарит новых (◆)</span>
        <span className="prop-stepper">
          <NumStepper
            value={type.w}
            min={1}
            max={8}
            onChange={(w) => onPatch({ w })}
            title="Ширина новых блоков"
          />
          <span>×</span>
          <NumStepper
            value={type.h}
            min={1}
            max={8}
            onChange={(h) => onPatch({ h })}
            title="Высота новых блоков"
          />
        </span>
      </div>
      <TextAreaRow
        label="Начальное содержимое"
        value={type.blank}
        onCommit={(v) => {
          if (v !== type.blank) onPatch({ blank: v })
        }}
      />
      <div className="prop-row prop-buttons">
        <button
          className="prop-btn is-danger"
          onClick={onDelete}
          title="Блоки этого типа перейдут на базовый вид. Можно отменить через Ctrl+Z."
        >
          Удалить тип
        </button>
      </div>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="prop-section">
      <h3 className="prop-section-title">{title}</h3>
      {children}
    </section>
  )
}

/** Однострочное поле: черновик внутри, коммит по Enter или уходу фокуса. */
function TextRow({
  label,
  value,
  maxLength,
  onCommit,
}: {
  label: string
  value: string
  maxLength?: number
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    if (draft !== value) onCommit(draft)
  }

  return (
    <label className="prop-row">
      <span className="prop-label">{label}</span>
      <input
        className="prop-input"
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function TextAreaRow({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <label className="prop-col">
      <span className="prop-label">{label}</span>
      <textarea
        className="prop-textarea"
        value={draft}
        rows={4}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft)
        }}
      />
    </label>
  )
}

function NumStepper({
  value,
  min,
  max,
  title,
  onChange,
}: {
  value: number
  min: number
  max: number
  title: string
  onChange: (v: number) => void
}) {
  return (
    <span className="prop-stepper" title={title}>
      <button disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="prop-num">
        {value}◆
      </span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  )
}
