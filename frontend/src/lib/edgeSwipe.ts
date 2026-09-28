// Свайп «назад» от левого края — в standalone-PWA на iOS системного жеста нет (он есть только в Safari
// с адресной строкой). Здесь пороги и решения без DOM; касания слушает hooks/useEdgeBack.

/** Ширина зоны у края: боковой отступ экрана (16 px), строки списка начинаются правее и свой свайп не теряют. */
export const EDGE = 16
/** Сдвиг пальца, после которого решаем: жест «назад» или прокрутка. */
export const SLOP = 8
/** Протянули дальше — уходим назад. */
export const BACK_AT = 72
/** Смахнули быстрее (px/с) — назад и с малым сдвигом. */
export const BACK_VELOCITY = 500

export type EdgeDecision = 'wait' | 'track' | 'cancel'

export function startsAtEdge(x: number): boolean {
  return x >= 0 && x < EDGE
}

/** Горизонтально вправо (с запасом против диагонали) — наш жест; вертикально или влево — прокрутка. */
export function decideEdge(dx: number, dy: number): EdgeDecision {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return 'wait'
  return dx > 0 && dx > Math.abs(dy) * 1.2 ? 'track' : 'cancel'
}

export function shouldGoBack(dx: number, velocity: number): boolean {
  return dx > BACK_AT || (dx > 24 && velocity > BACK_VELOCITY)
}

/** 0…1 — насколько «натянут» жест (для индикатора у края). */
export function edgeProgress(dx: number): number {
  return Math.min(1, Math.max(0, dx / BACK_AT))
}

/**
 * Включать ли жест. В Safari на iOS с адресной строкой свой системный «назад» от края — два «назад»
 * подряд. Там жест только в standalone (экран «Домой»); на других устройствах (Android, эмуляция) — всегда.
 */
export function edgeBackEnabled(ios: boolean, standalone: boolean): boolean {
  return !ios || standalone
}
