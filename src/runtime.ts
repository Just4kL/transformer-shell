import { create } from 'zustand'
import { resolveBase, type CustomTypeDef } from './blockTypes'
import { hasErrors, validateLinks } from './links'
import { useShell } from './store'
import type { Block, LayoutSettings, Link } from './layout'

/**
 * Исполнение графа. Проект — в docs/execution.md.
 *
 * Чистая часть (`runGraphPure`) не трогает сторы — её можно тестировать
 * импортом. Тонкая обвязка (`runGraph`, `emitAction`) связывает её
 * с состоянием. Прогоны синхронные и детерминированные: порядок —
 * топологический (Кана, ties по id), циклы — потактово до стабильности
 * или лимита. Значения на портах эфемерны; в файл уходит только
 * дописанное в Журналы (одной точкой истории на прогон).
 */

export interface FlowValue {
  /** Полезная нагрузка — всегда строка. */
  text: string
  /** id блока-источника. */
  origin: string
  /** Такт, на котором значение вычислено. */
  tick: number
}

export type RunStop = 'stable' | 'limit' | 'errors' | 'empty'

export interface RunReport {
  ticks: number
  stopped: RunStop
  /** Сколько значений на портах после прогона. */
  emitted: number
  /** Сколько строк реально дописано в Журналы. */
  appended: number
  /** Сколько строк не влезло в лимит MAX_APPEND_LINES. */
  overflow: number
  at: number
}

/** Лимит строк, дописываемых в Журналы за один прогон. */
export const MAX_APPEND_LINES = 200

interface RuntimeState {
  /** Значения на портах: blockId -> portId -> значение. Эфемерно. */
  values: Record<string, Record<string, FlowValue>>
  lastRun: RunReport | null
  tick: number
}

export const useRuntime = create<RuntimeState>(() => ({
  values: {},
  lastRun: null,
  tick: 0,
}))

type OutMap = Map<string, Map<string, FlowValue>>

interface ValidEdge {
  from: string
  to: string
}

/** Провод: какой выход питает данный вход. Проходит те же ворота, что addLink. */
interface Wire {
  toBlock: string
  toPort: string
  fromBlock: string
  fromPort: string
}

function buildWires(blocks: readonly Block[], links: readonly Link[]): Wire[] {
  const ports = new Map<string, Map<string, 'in' | 'out'>>()
  for (const b of blocks) {
    const m = new Map<string, 'in' | 'out'>()
    for (const p of b.ports) m.set(p.id, p.dir)
    ports.set(b.id, m)
  }
  const wires: Wire[] = []
  const seen = new Set<string>()
  for (const l of links) {
    if (ports.get(l.from.block)?.get(l.from.port) !== 'out') continue
    if (ports.get(l.to.block)?.get(l.to.port) !== 'in') continue
    if (l.from.block === l.to.block && l.from.port === l.to.port) continue
    const key = `${l.from.block}:${l.from.port}>${l.to.block}:${l.to.port}`
    if (seen.has(key)) continue
    seen.add(key)
    wires.push({ toBlock: l.to.block, toPort: l.to.port, fromBlock: l.from.block, fromPort: l.from.port })
  }
  return wires
}

/** Связи, пригодные для прогона: концы есть, направления верные. */
function validEdges(wires: Wire[]): ValidEdge[] {
  const out: ValidEdge[] = []
  const seen = new Set<string>()
  for (const w of wires) {
    const key = `${w.fromBlock}>${w.toBlock}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ from: w.fromBlock, to: w.toBlock })
  }
  return out
}

/** Порядок Кана (ties — по id) + множество узлов в циклах. */
function orderBlocks(ids: string[], edges: ValidEdge[]): { order: string[]; cyclic: Set<string> } {
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]))
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue
    const list = adj.get(e.from) ?? []
    if (!list.includes(e.to)) list.push(e.to)
    adj.set(e.from, list)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0).sort()
  const order: string[] = []
  while (queue.length > 0) {
    const cur = queue.shift() as string
    order.push(cur)
    for (const next of adj.get(cur) ?? []) {
      const d = (indeg.get(next) ?? 1) - 1
      indeg.set(next, d)
      if (d === 0) {
        queue.push(next)
        queue.sort()
      }
    }
  }
  const cyclic = new Set(ids.filter((id) => (indeg.get(id) ?? 0) > 0))
  return { order: [...order, ...[...cyclic].sort()], cyclic }
}

export interface PureRunResult {
  outputs: OutMap
  /** id блока -> дописываемые строки (без временной метки — её ставит runGraph). */
  appends: Map<string, string[]>
  ticks: number
  stopped: RunStop
  overflow: number
  emitted: number
}

/**
 * Чистый прогон: detergминированный, без побочек.
 * `seed` — значения, уже лежащие на портах (клики кнопок между прогонами).
 */
export function runGraphPure(
  blocks: readonly Block[],
  links: readonly Link[],
  customs: readonly CustomTypeDef[],
  settings: LayoutSettings,
  startTick: number,
  seed: OutMap,
): PureRunResult {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const ids = [...byId.keys()].sort()
  if (ids.length === 0) {
    return { outputs: new Map(), appends: new Map(), ticks: 0, stopped: 'empty', overflow: 0, emitted: 0 }
  }

  const edges = validEdges(buildWires(blocks, links))
  const { order, cyclic } = orderBlocks(ids, edges)
  const logContent = new Map(blocks.map((b) => [b.id, b.content]))

  // входы блока: идём по проводам к выходам-источникам
  const wires = buildWires(blocks, links)
  const gather = (b: Block, outputs: OutMap): Map<string, FlowValue> => {
    const ins = new Map<string, FlowValue>()
    for (const p of b.ports) {
      if (p.dir !== 'in') continue
      const w = wires.find((x) => x.toBlock === b.id && x.toPort === p.id)
      if (!w) continue
      const v = outputs.get(w.fromBlock)?.get(w.fromPort)
      if (v) ins.set(p.id, v)
    }
    return ins
  }

  const compute = (b: Block): string | null => {
    switch (resolveBase(b.kind, customs)) {
      case 'note':
      case 'text':
        // источник: входы игнорируются, чужой текст ничего не переписывает
        return b.content
      case 'log':
        // приёмник и источник своего (уже дописанного ранее) содержимого
        return logContent.get(b.id) ?? ''
      case 'actions':
      case 'blank':
      default:
        // действия эмитят только кликами, заглушка молчит
        return null
    }
  }

  const appends = new Map<string, string[]>()
  let overflow = 0
  let appendedTotal = 0
  const recordLog = (b: Block, ins: Map<string, FlowValue>) => {
    if (resolveBase(b.kind, customs) !== 'log') return
    for (const p of b.ports) {
      if (p.dir !== 'in') continue
      const v = ins.get(p.id)
      if (!v) continue
      if (appendedTotal >= MAX_APPEND_LINES) {
        overflow += 1
        continue
      }
      const list = appends.get(b.id) ?? []
      list.push(v.text)
      appends.set(b.id, list)
      appendedTotal += 1
    }
  }

  // сид: значения от кликов между прогонами (только actions-выходы)
  let outputs: OutMap = new Map()
  for (const b of blocks) {
    if (resolveBase(b.kind, customs) !== 'actions') continue
    for (const p of b.ports) {
      if (p.dir !== 'out') continue
      const v = seed.get(b.id)?.get(p.id)
      if (!v) continue
      let m = outputs.get(b.id)
      if (!m) {
        m = new Map()
        outputs.set(b.id, m)
      }
      m.set(p.id, v)
    }
  }

  const serialize = (o: OutMap): string => {
    const parts: string[] = []
    for (const bid of [...o.keys()].sort()) {
      for (const pid of [...(o.get(bid)?.keys() ?? [])].sort()) {
        parts.push(`${bid}:${pid}=${o.get(bid)?.get(pid)?.text ?? ''}`)
      }
    }
    return parts.join('\n')
  }

  let tick = startTick
  let ticks = 0
  // DAG сходится за один цепной проход; циклы — итерациями до лимита
  const maxPasses = cyclic.size > 0 ? Math.max(1, settings.cycleLimit) : 1

  for (let pass = 0; pass < maxPasses; pass += 1) {
    tick += 1
    ticks += 1
    const next: OutMap = new Map()
    for (const bid of order) {
      const b = byId.get(bid)
      if (!b) continue
      // цепное чтение: уже посчитанное в этом проходе видно сразу
      const merged: OutMap = new Map(outputs)
      for (const [k, v] of next) merged.set(k, v)
      const ins = gather(b, merged)
      recordLog(b, ins)
      const text = compute(b)
      if (text === null) continue
      const outs = new Map<string, FlowValue>()
      for (const p of b.ports) {
        if (p.dir !== 'out') continue
        outs.set(p.id, { text, origin: b.id, tick })
      }
      if (outs.size > 0) next.set(b.id, outs)
    }
    if (serialize(next) === serialize(outputs)) {
      outputs = next
      break
    }
    outputs = next
  }

  const stopped: RunStop = cyclic.size === 0 || ticks < maxPasses ? 'stable' : 'limit'
  let emitted = 0
  for (const m of outputs.values()) emitted += m.size
  return { outputs, appends, ticks, stopped, overflow, emitted }
}

function stamp(): string {
  return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Прогон целиком: ворота валидации, одна точка истории, применение,
 * отчёт. Возвращает отчёт (и кладёт его же в useRuntime.lastRun).
 */
export function runGraph(): RunReport {
  const s = useShell.getState()
  const rt = useRuntime.getState()

  const issues = validateLinks(s.blocks, s.links)
  if (hasErrors(issues)) {
    const report: RunReport = { ticks: 0, stopped: 'errors', emitted: 0, appended: 0, overflow: 0, at: Date.now() }
    useRuntime.setState({ lastRun: report })
    return report
  }

  s.checkpoint()
  const time = stamp()
  const res = runGraphPure(s.blocks, s.links, s.customTypes, s.settings, rt.tick, toOutMap(rt.values))

  if (res.appends.size > 0) {
    const cur = useShell.getState()
    const next = cur.blocks.map((b) => {
      const lines = res.appends.get(b.id)
      if (!lines || lines.length === 0) return b
      const stamped = lines.map((t) => `← [${time}] ${t}`).join('\n')
      return { ...b, content: b.content.length > 0 ? `${b.content}\n${stamped}` : stamped }
    })
    useShell.setState({ blocks: next })
  }

  let appended = 0
  for (const lines of res.appends.values()) appended += lines.length

  const plain: Record<string, Record<string, FlowValue>> = {}
  for (const [bid, m] of res.outputs) {
    plain[bid] = {}
    for (const [pid, v] of m) plain[bid][pid] = v
  }
  const report: RunReport = {
    ticks: res.ticks,
    stopped: res.stopped,
    emitted: res.emitted,
    appended,
    overflow: res.overflow,
    at: Date.now(),
  }
  useRuntime.setState({ values: plain, lastRun: report, tick: rt.tick + res.ticks })
  return report
}

function toOutMap(plain: Record<string, Record<string, FlowValue>>): OutMap {
  const m = new Map<string, Map<string, FlowValue>>()
  for (const bid of Object.keys(plain)) m.set(bid, new Map(Object.entries(plain[bid])))
  return m
}

/**
 * Клик по кнопке действий: эмитит имя на все выходы блока немедленно.
 * Работает и без прогона; следующий прогон подхватит значение как сид.
 */
export function emitAction(blockId: string, text: string): void {
  const s = useShell.getState()
  const b = s.blocks.find((x) => x.id === blockId)
  if (!b) return
  const rt = useRuntime.getState()
  const tick = rt.tick + 1
  const ports: Record<string, FlowValue> = { ...(rt.values[blockId] ?? {}) }
  for (const p of b.ports) {
    if (p.dir !== 'out') continue
    ports[p.id] = { text, origin: blockId, tick }
  }
  useRuntime.setState({
    values: { ...rt.values, [blockId]: ports },
    tick,
  })
}
