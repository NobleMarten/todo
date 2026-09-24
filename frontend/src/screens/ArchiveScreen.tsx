import type { Task } from '../api/types'
import { Activity } from '../components/Activity'
import { DoneRow } from '../components/DoneRow'
import { Logo, ScreenHeader } from '../components/ScreenHeader'
import { ErrorState } from '../components/ErrorState'
import { SkeletonRows } from '../components/Skeleton'
import { SpinIcon } from '../components/icons'
import { useActivity } from '../hooks/useActivity'
import { useProjects } from '../hooks/useProjects'
import { useArchive } from '../hooks/useTasks'
import { addDays, dayHeading, timeOf, todayStr, toDateStr } from '../lib/date'

/** Экран «Итоги»: грид активности и выполненные задачи по дням, свежие сверху. */
export function ArchiveScreen() {
  const activity = useActivity()
  const archive = useArchive()
  const { all: projects } = useProjects()
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const today = todayStr()

  return (
    <div className="screen">
      <div className="eyebrow">
        <Logo />
      </div>
      <ScreenHeader title="Итоги" />

      <Activity
        counts={activity.counts}
        loading={activity.loading}
        error={activity.error}
        onReload={activity.reload}
      />

      {archive.error && archive.items.length > 0 && (
        <button className="error-bar" onClick={() => archive.reload()}>
          {archive.error} · повторить
        </button>
      )}
      {archive.actionError && (
        <button className="error-bar" onClick={archive.clearActionError}>
          {archive.actionError}
        </button>
      )}

      {archive.loading && archive.items.length === 0 ? (
        <SkeletonRows count={5} />
      ) : archive.error && archive.items.length === 0 ? (
        <ErrorState message={archive.error} onRetry={() => archive.reload()} />
      ) : (
        archive.items.length === 0 && (
          <div className="empty">
            <span className="empty-title">выполненных задач пока нет</span>
            <span className="empty-hint">отметь задачу — она появится здесь, а в гриде загорится квадратик</span>
          </div>
        )
      )}

      {byDay(archive.items).map(([day, tasks]) => (
        <section key={day} className="task-section archive-day">
          <div className="section-label">
            {dayLabel(day, today)} · {tasks.length}
          </div>
          {tasks.map((t) => (
            <DoneRow
              key={t.id}
              task={t}
              project={t.project_id !== null ? projectById.get(t.project_id) : undefined}
              aside={timeOf(t.done_at)}
              onUndo={() => archive.undo(t.id)}
            />
          ))}
        </section>
      ))}

      {archive.items.length < archive.total && (
        <button className="btn btn-ghost archive-more" disabled={archive.loadingMore} onClick={archive.loadMore}>
          {archive.loadingMore ? <SpinIcon /> : `показать ещё · ${archive.total - archive.items.length}`}
        </button>
      )}
    </div>
  )
}

/** Группы по локальному дню done_at; задачи уже отсортированы по done_at desc. */
function byDay(tasks: Task[]): [string, Task[]][] {
  const groups = new Map<string, Task[]>()
  for (const t of tasks) {
    const key = t.done_at ? toDateStr(new Date(t.done_at)) : ''
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  return [...groups]
}

function dayLabel(day: string, today: string): string {
  if (day === '') return 'без даты'
  if (day === today) return 'сегодня'
  if (day === addDays(today, -1)) return 'вчера'
  return dayHeading(day)
}
