// Заглушки на время первой загрузки: повторяют форму строк, чтобы экран не прыгал, когда придут данные.

const WIDTHS = ['72%', '54%', '84%', '46%', '63%', '78%']

/** Строки задач (56 px, кружок + строка текста) или строки списков. */
export function SkeletonRows({ count = 4, variant = 'task' }: { count?: number; variant?: 'task' | 'project' }) {
  return (
    <div className={`skeleton-rows skeleton-${variant}`} role="status" aria-label="загрузка">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span className={`skeleton ${variant === 'task' ? 'skeleton-check' : 'skeleton-dot'}`} />
          <span className="skeleton skeleton-line" style={{ width: WIDTHS[i % WIDTHS.length] }} />
        </div>
      ))}
    </div>
  )
}

/** Прямоугольник под крупный блок (грид активности, карточка фокуса). */
export function SkeletonBlock({ height }: { height: number }) {
  return <div className="skeleton skeleton-block" style={{ height }} role="status" aria-label="загрузка" />
}
