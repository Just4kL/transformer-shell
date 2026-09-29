import type { Block, Link } from './layout'

/**
 * Проверка связей живого графа — чистая функция для UI.
 *
 * После sanitize() ошибок 1–4 быть не может, но валидация нужна и живой:
 * подсветить проблему сразу, а не когда файл перечитают. Циклы —
 * warning (разрешены, лимит — в settings.cycleLimit), связи сквозь
 * категории — info (рисуем заглушку-переход).
 */

export type IssueLevel = 'error' | 'warning' | 'info'

export interface LinkIssue {
  level: IssueLevel
  code: 'broken-end' | 'bad-dir' | 'duplicate' | 'self-loop' | 'cycle' | 'xcat'
  linkId?: string
  /** Путь цикла для code === 'cycle'. */
  path?: string[]
  message: string
}

const MAX_CYCLES = 20

export function validateLinks(blocks: readonly Block[], links: readonly Link[]): LinkIssue[] {
  const issues: LinkIssue[] = []

  const ports = new Map<string, Map<string, 'in' | 'out'>>()
  const categoryOf = new Map<string, string>()
  for (const b of blocks) {
    categoryOf.set(b.id, b.category)
    const m = new Map<string, 'in' | 'out'>()
    for (const p of b.ports) m.set(p.id, p.dir)
    ports.set(b.id, m)
  }
  const dirOf = (block: string, port: string): 'in' | 'out' | null =>
    ports.get(block)?.get(port) ?? null

  const seenPairs = new Set<string>()
  const valid: Link[] = []

  for (const l of links) {
    const fromDir = dirOf(l.from.block, l.from.port)
    const toDir = dirOf(l.to.block, l.to.port)
    if (fromDir === null || toDir === null) {
      issues.push({
        level: 'error',
        code: 'broken-end',
        linkId: l.id,
        message: `Связь ${l.id}: конец не найден (блок или порт удалён)`,
      })
      continue
    }
    if (fromDir !== 'out' || toDir !== 'in') {
      issues.push({
        level: 'error',
        code: 'bad-dir',
        linkId: l.id,
        message: `Связь ${l.id}: направление перепутано — нужно из выхода во вход`,
      })
      continue
    }
    if (l.from.block === l.to.block && l.from.port === l.to.port) {
      issues.push({
        level: 'error',
        code: 'self-loop',
        linkId: l.id,
        message: `Связь ${l.id}: порт замкнут сам на себя`,
      })
      continue
    }
    const pair = `${l.from.block}:${l.from.port}>${l.to.block}:${l.to.port}`
    if (seenPairs.has(pair)) {
      issues.push({
        level: 'error',
        code: 'duplicate',
        linkId: l.id,
        message: `Связь ${l.id}: такая пара портов уже связана`,
      })
      continue
    }
    seenPairs.add(pair)
    valid.push(l)
  }

  // циклы на уровне блоков — поиск в глубину с восстановлением пути
  const adj = new Map<string, string[]>()
  for (const l of valid) {
    const list = adj.get(l.from.block) ?? []
    if (!list.includes(l.to.block)) list.push(l.to.block)
    adj.set(l.from.block, list)
  }
  const reported = new Set<string>()
  const visit = (node: string, stack: string[]): void => {
    if (reported.size >= MAX_CYCLES) return
    const at = stack.indexOf(node)
    if (at >= 0) {
      const cycle = [...stack.slice(at), node]
      // нормализуем по множеству узлов (конец дублирует начало),
      // чтобы один цикл не показывать дважды с разных стартов
      const key = [...new Set(cycle)].sort().join('>')
      if (!reported.has(key)) {
        reported.add(key)
        issues.push({
          level: 'warning',
          code: 'cycle',
          path: cycle,
          message: `Цикл: ${cycle.join(' → ')}`,
        })
      }
      return
    }
    for (const next of adj.get(node) ?? []) {
      if (reported.size >= MAX_CYCLES) return
      visit(next, [...stack, node])
    }
  }
  for (const b of blocks) {
    if (reported.size >= MAX_CYCLES) break
    visit(b.id, [])
  }

  for (const l of valid) {
    const a = categoryOf.get(l.from.block)
    const b = categoryOf.get(l.to.block)
    if (a !== undefined && b !== undefined && a !== b) {
      issues.push({
        level: 'info',
        code: 'xcat',
        linkId: l.id,
        message: `Связь ${l.id}: идёт в другую категорию`,
      })
    }
  }

  return issues
}

/** Быстрый ответ «есть ли ошибки» — для бейджа в панели окна. */
export function hasErrors(issues: readonly LinkIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
