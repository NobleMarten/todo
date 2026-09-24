import { useEffect, useRef, useState } from 'react'
import { useArchive, type ArchiveScope } from '../hooks/useTasks'
import { shortDate, toDateStr } from '../lib/date'
import { DoneRow } from './DoneRow'
import { ChevronIcon, SpinIcon } from './icons'

/**
 * Выполненные задачи списка внизу его экрана: свёрнутое «выполнено · N», свежие сверху,
 * галочка возвращает задачу в работу. Выполненная строка уходит из списка сюда — счётчик
 * при этом подсвечивается, чтобы было видно, куда она делась.
 */
export function DoneSection({ scope }: { scope: ArchiveScope }) {
  const archive = useArchive(scope)
  const [open, setOpen] = useState(false)
  const [bump, setBump] = useState(false)
  const prevTotal = useRef<number | null>(null)

  useEffect(() => {
    if (archive.loading) return
    const prev = prevTotal.current
    prevTotal.current = archive.total
    if (prev === null || archive.total <= prev) return
    setBump(true)
    const t = setTimeout(() => setBump(false), 900)
    return () => clearTimeout(t)
  }, [archive.total, archive.loading])

  if (archive.total === 0 && archive.items.length === 0) return null

  return (
    <section className="task-section done-section">
      <button
        className={`section-label section-toggle tone-none ${bump ? 'bump' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        выполнено · {archive.total}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <>
          {archive.items.map((t) => (
            <DoneRow
              key={t.id}
              task={t}
              aside={t.done_at ? shortDate(toDateStr(new Date(t.done_at))) : undefined}
              onUndo={() => archive.undo(t.id)}
            />
          ))}
          {archive.items.length < archive.total && (
            <button className="btn btn-ghost archive-more" disabled={archive.loadingMore} onClick={archive.loadMore}>
              {archive.loadingMore ? <SpinIcon /> : `показать ещё · ${archive.total - archive.items.length}`}
            </button>
          )}
        </>
      )}
      {archive.actionError && (
        <button className="error-bar" onClick={archive.clearActionError}>
          {archive.actionError}
        </button>
      )}
    </section>
  )
}
