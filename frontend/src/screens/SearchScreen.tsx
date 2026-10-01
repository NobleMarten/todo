import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import type { Task } from '../api/types'
import { AnimatedRow } from '../components/AnimatedRow'
import { EmptyState } from '../components/EmptyState'
import { DoneRow } from '../components/DoneRow'
import { ScreenHeader } from '../components/ScreenHeader'
import { SkeletonRows } from '../components/Skeleton'
import { TaskRow } from '../components/TaskRow'
import { SearchIcon } from '../components/icons'
import { useProjects } from '../hooks/useProjects'
import { useSearch } from '../hooks/useSearch'
import { shortDate, toDateStr, todayStr } from '../lib/date'

/**
 * Поиск по заголовку и заметке: активные, ниже — выполненные. Строка запроса живёт в ?q=,
 * поэтому карточка поверх и «назад» из неё возвращают к тем же результатам.
 */
export function SearchScreen() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const { q, result, loading, error, update } = useSearch(text)
  // одни функции на все строки (TaskRow — memo)
  const complete = (t: Task) => update(t.id, { done: true })
  const setDue = (t: Task, d: string | null) => update(t.id, { due_date: d })
  const { all: projects } = useProjects()
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const projectOf = (t: Task) => (t.project_id !== null ? projectById.get(t.project_id) : undefined)
  const today = todayStr()

  const onChange = (v: string) => {
    setText(v)
    const p = new URLSearchParams(params)
    if (v.trim()) p.set('q', v)
    else p.delete('q')
    setParams(p, { replace: true })
  }

  const empty = result && result.active.length === 0 && result.done.length === 0

  return (
    <div className="screen">
      <ScreenHeader title="Поиск" back="/lists" />

      <label className="search-field">
        <SearchIcon />
        <input
          type="search"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="заголовок или заметка"
          aria-label="поиск задач"
          maxLength={100}
          autoFocus
          enterKeyHint="search"
        />
      </label>

      {error && <div className="error-bar">{error}</div>}

      {!q ? (
        <EmptyState art="search" hint="ищет по заголовкам и заметкам — и в активных, и в выполненных" />
      ) : loading && !result ? (
        <SkeletonRows count={3} />
      ) : empty ? (
        <EmptyState art="search" title="ничего не нашлось" hint={`по «${q}» нет ни заголовков, ни заметок`} />
      ) : (
        result && (
          <>
            {result.active.length > 0 && (
              <section className="task-section">
                <div className="section-label">активные · {result.active.length}</div>
                <ul className="task-list">
                  <AnimatePresence initial={false}>
                    {result.active.map((t) => (
                      <AnimatedRow key={t.id} id={t.id}>
                        <TaskRow
                          task={t}
                          today={today}
                          project={projectOf(t)}
                          onToggle={complete}
                          onSetDue={setDue}
                        />
                      </AnimatedRow>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )}
            {result.done.length > 0 && (
              <section className="task-section">
                <div className="section-label tone-none">
                  выполненные · {result.doneTotal}
                  {result.doneTotal > result.done.length && ` (последние ${result.done.length})`}
                </div>
                {result.done.map((t) => (
                  <DoneRow
                    key={t.id}
                    task={t}
                    project={projectOf(t)}
                    aside={t.done_at ? shortDate(toDateStr(new Date(t.done_at))) : undefined}
                    onUndo={() => update(t.id, { done: false })}
                  />
                ))}
              </section>
            )}
          </>
        )
      )}
    </div>
  )
}
