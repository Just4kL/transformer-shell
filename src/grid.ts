/**
 * ДВОЙНАЯ РАЗМЕТКА
 * ================
 * Вся оболочка (панель окна, рельс категорий, рабочая область, блоки)
 * выровнена по двум уровням сетки:
 *
 *   маленький квадрат  UNIT  =  8px   — мелкий ритм: размеры блоков, шаги
 *   большой квадрат    MAJOR = 64px   = 8 UNIT — структурный ритм:
 *                       ширина рельса, высоты панелей, отступы, полки
 *
 * Обе системы сетки привязаны к началу окна. Ширина рельса всегда кратна
 * MAJOR, а панель окна кратна UNIT, поэтому сетка рабочей области
 * автоматически остаётся фазовой с общей сеткой окна.
 */

/** Маленький квадрат разметки. */
export const UNIT = 8

/** Большой квадрат разметки = 8 маленьких. */
export const MAJOR = UNIT * 8

/** Высота панели окна: 5 маленьких квадратов. */
export const BAR_H = UNIT * 5

/** Поля рабочей области: один большой квадрат со всех сторон. */
export const PAD = MAJOR

/** Границы ширины рельса категорий. */
export const RAIL_MIN = MAJOR * 2 // 128 — «минимум места»
export const RAIL_MAX = MAJOR * 8 // 512
export const RAIL_DEFAULT = MAJOR * 2

/** Ширина полосы захвата разделителя. Не влияет на сетку — слой поверх. */
export const SPLITTER_W = UNIT * 2

/** Минимальный размер блока — один большой квадрат. */
export const BLOCK_MIN = MAJOR

/** Заголовок блока в развёрнутом виде. */
export const BLOCK_HEAD = UNIT * 5

/** Высота шага в списке категорий. */
export const RAIL_ROW = UNIT * 4

/** Допуск захвата направляющей при перетаскивании, px. */
export const GUIDE_TOL = 5

export type SnapTier = 'minor' | 'major'

export interface SnapResult {
  value: number
  tier: SnapTier
}

/** Округление к шагу сетки. */
export const snap = (value: number, step: number): number =>
  Math.round(value / step) * step

/** Округление вниз к шагу — для правых/нижних границ. */
export const snapDown = (value: number, step: number): number =>
  Math.max(step, Math.floor(value / step) * step)

/**
 * Двухступенчатое выравнивание: если значение близко к большому квадрату,
 * притягиваем к нему (крупный ритм), иначе — к маленькому.
 * Получается та самая «двойная разметка» в действии: блок держится
 * на мелких квадратах, но при желании встаёт на крупный.
 */
export function snapFlexible(value: number, tolerance = MAJOR / 4): SnapResult {
  const major = Math.round(value / MAJOR) * MAJOR
  if (major > 0 && Math.abs(value - major) <= tolerance) {
    return { value: major, tier: 'major' }
  }
  return { value: Math.max(UNIT, snap(value, UNIT)), tier: 'minor' }
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max)

/** Ближайшее значение из набора кандидатов с учётом допуска. */
export function nearestCandidate(
  value: number,
  candidates: readonly number[],
  tolerance = GUIDE_TOL,
): number | null {
  let best: number | null = null
  let bestDist = tolerance + 1
  for (const c of candidates) {
    const d = Math.abs(value - c)
    if (d <= tolerance && d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return best
}

/** Красивая подпись размеров для служебных хитэпов. */
export const fmt = (px: number): string =>
  px % MAJOR === 0 ? `${px / MAJOR}◆` : `${Math.round(px / UNIT)}▪`

/**
 * Смещение фона сетки, чтобы линии ложились на общие линии окна.
 * Полотно рабочей области начинается не в нуле окна, а со сдвига
 * (ширина рельса, высота панели). Возвращаем сдвиг начала паттерна,
 * при котором крупные линии полотна совпадают с крупными линиями окна.
 */
export function gridOffset(railWidth: number, barHeight = BAR_H): { x: number; y: number } {
  return {
    x: (MAJOR - (railWidth % MAJOR)) % MAJOR,
    y: (MAJOR - (barHeight % MAJOR)) % MAJOR,
  }
}
