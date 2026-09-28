// Жест «потянуть шит вниз, чтобы закрыть» — пороги и решения без DOM (Sheet.tsx только снимает координаты).

/** Сдвиг пальца, после которого решаем, чей это жест: шита или прокрутки. */
export const SLOP = 6
/** Протянули дальше — закрываем. */
export const DISMISS_OFFSET = 120
/** Смахнули быстрее (px/с) — закрываем даже с малым сдвигом. */
export const DISMISS_VELOCITY = 600

export type Decision = 'wait' | 'drag' | 'ignore'

/**
 * Чей жест. От шапки (грабер, строка с крестиком) шит тянется всегда, от тела —
 * только когда содержимое прокручено до верха и палец идёт вниз; иначе это прокрутка.
 */
export function decide(dx: number, dy: number, atTop: boolean, fromHeader: boolean): Decision {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return 'wait'
  if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) return 'ignore'
  return fromHeader || atTop ? 'drag' : 'ignore'
}

/**
 * Гасить ли touchmove, пока жест ещё не решён: иначе iOS успевает начать прокрутку (резинку)
 * до того, как палец пройдёт SLOP, и шит уже не получит движение.
 */
export function blocksScroll(dx: number, dy: number, atTop: boolean, fromHeader: boolean): boolean {
  return dy > 0 && Math.abs(dy) >= Math.abs(dx) && (fromHeader || atTop)
}

export function shouldDismiss(offset: number, velocity: number): boolean {
  return offset > DISMISS_OFFSET || (offset > 0 && velocity > DISMISS_VELOCITY)
}

export interface Sample {
  t: number // мс
  y: number
}

/** Скорость, px/с, по точкам последних `windowMs` мс жеста (старые точки выкидываются из массива). */
export function velocity(samples: Sample[], windowMs = 100): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[0]
  for (const s of samples) {
    if (last.t - s.t <= windowMs) {
      first = s
      break
    }
  }
  const dt = last.t - first.t
  return dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0
}
