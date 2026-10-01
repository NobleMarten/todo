// «Потянуть вниз — обновить»: пороги и решения без DOM; касания слушает hooks/usePullRefresh.

/** Сдвиг пальца, после которого решаем: тянем вниз или это горизонтальный жест (свайп строки, «назад»). */
export const PULL_SLOP = 8
/** Индикатор опустился на столько — отпускание обновит. */
export const PULL_AT = 72
/** Дальше индикатор не едет, сколько ни тяни. */
export const PULL_MAX = 120

export type PullDecision = 'wait' | 'track' | 'cancel'

/** Вниз и заметно вертикальнее, чем вбок, — наш жест; вверх или вбок — не наш. */
export function decidePull(dx: number, dy: number): PullDecision {
  if (Math.abs(dx) < PULL_SLOP && Math.abs(dy) < PULL_SLOP) return 'wait'
  return dy > 0 && dy > Math.abs(dx) * 1.2 ? 'track' : 'cancel'
}

/** Путь индикатора за пальцем: сначала почти вровень, дальше «резинка» — к PULL_MAX, но никогда не больше. */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0
  return PULL_MAX * (1 - Math.exp(-dy / PULL_MAX))
}

/** 0…1 — насколько натянут жест (поворот стрелки, прозрачность). */
export function pullProgress(d: number): number {
  return Math.min(1, Math.max(0, d / PULL_AT))
}

export function shouldRefresh(d: number): boolean {
  return d >= PULL_AT
}

/** С чего жест не начинается: ручка перетаскивания, поля ввода, шит карточки, помеченные data-no-pull. */
export const PULL_IGNORE = '.grip, input, textarea, select, [contenteditable], .sheet-layer, [data-no-pull]'
