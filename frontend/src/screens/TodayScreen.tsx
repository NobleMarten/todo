import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Project, Task } from '../api/types'
import { DoneRow } from '../components/DoneRow'
import { Logo, ScreenHeader } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { TaskRun } from '../components/TaskRun'
import { useOpenTask } from '../components/TaskSheet'
import { AlertIcon, ChevronIcon, PlusIcon, SpinIcon } from '../components/icons'
import { useDay } from '../hooks/useDay'
import { useProjects } from '../hooks/useProjects'
import { dayHeading, shortDate } from '../lib/date'
import { PRIORITY_LABEL } from '../lib/format'

/**
 * Экран «Сегодня» (макет A1): прогресс дня, фокус — первая задача плана, красный блок
 * «просрочено» (дедлайн прошёл или вчера не доделал), план на день и свёрнутое «готово».
 */
export function TodayScreen() {
  const { day, loading, error, actionError, clearActionError, reload, toggle, update, moveToToday, reorderPlanned } =
    useDay()
  const { all: projects } = useProjects()
  const [showDone, setShowDone] = useState(false)

  const projectById = new Map(projects.map((p) => [p.id, p]))
  const projectOf = (t: Task) => (t.project_id !== null ? projectById.get(t.project_id) : undefined)

  if (!day) {
    return (
      <div className="screen">
        <div className="eyebrow">
          <Logo />
        </div>
        <ScreenHeader title="Сегодня" />
        {error ? (
          <button className="error-bar" onClick={() => reload()}>
            {error} · повторить
          </button>
        ) : (
          loading && (
            <div className="rows-loading">
              <SpinIcon />
            </div>
          )
        )}
      </div>
    )
  }

  const today = day.date
  const [focus, ...plan] = day.planned
  const late = [...day.overdue, ...day.carry_over]
  const doneCount = day.done_today.length
  const total = doneCount + day.planned.length

  return (
    <div className="screen">
      <div className="eyebrow today-eyebrow">
        <span className="today-date">{dayHeading(today)}</span>
        <Logo />
      </div>
      <ScreenHeader title="Сегодня" aside={total > 0 ? `${doneCount} / ${total}` : undefined}>
        {total > 0 && (
          <span className="progress-track day-progress">
            <span className="progress-fill" style={{ width: `${(doneCount / total) * 100}%` }} />
          </span>
        )}
      </ScreenHeader>

      {error && (
        <button className="error-bar" onClick={() => reload()}>
          {error} · повторить
        </button>
      )}
      {actionError && (
        <button className="error-bar" onClick={clearActionError}>
          {actionError}
        </button>
      )}

      {focus && (
        <FocusCard task={focus} project={projectOf(focus)} today={today} onToggle={() => toggle(focus)} />
      )}

      {late.length > 0 && (
        <section className="task-section">
          <div className="section-label tone-overdue late-head">
            <AlertIcon size={13} />
            <span className="late-title">просрочено · {late.length}</span>
            <button className="chip chip-mono chip-danger" onClick={() => moveToToday(late.map((t) => t.id))}>
              перенести на сегодня
            </button>
          </div>
          <ul className="task-list">
            {late.map((t) => (
              <li key={t.id}>
                <TaskRow
                  task={t}
                  today={today}
                  project={projectOf(t)}
                  alert
                  onToggle={() => toggle(t)}
                  onSetDue={(d) => update(t.id, { due_date: d })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!focus ? (
        <div className="empty today-empty">
          <span>на сегодня ничего не запланировано</span>
          <Link to="/plan" className="btn btn-primary">
            собрать день
          </Link>
        </div>
      ) : (
        <section className="task-section">
          <div className="section-label">план на день · {plan.length}</div>
          {plan.length > 0 && (
            <TaskRun
              run={plan}
              today={today}
              draggable
              projectById={projectById}
              onToggle={toggle}
              onSetDue={(t, d) => update(t.id, { due_date: d })}
              onReorder={(ids) => reorderPlanned([focus.id, ...ids])}
            />
          )}
          <Link to="/plan" className="new-project plan-more">
            <PlusIcon />
            добавить из списков
          </Link>
        </section>
      )}

      {doneCount > 0 && (
        <section className="task-section done-section">
          <button
            className="section-label section-toggle tone-none"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            готово · {doneCount}
            <ChevronIcon open={showDone} />
          </button>
          {showDone &&
            day.done_today.map((t) => (
              <DoneRow key={t.id} task={t} project={projectOf(t)} onUndo={() => toggle(t)} />
            ))}
        </section>
      )}
    </div>
  )
}

interface FocusProps {
  task: Task
  project?: Project
  today: string
  onToggle: () => void
}

/** «Фокус дня» — первая задача плана, крупно и в рамке акцента. */
function FocusCard({ task, project, today, onToggle }: FocusProps) {
  const openTask = useOpenTask()
  const stats = task.subtask_stats
  const overdue = task.due_date !== null && task.due_date < today

  return (
    <section className="focus-card" aria-label="фокус дня">
      <span className="focus-label">фокус дня</span>
      <div className="focus-row">
        <button
          className="check-hit"
          onClick={onToggle}
          aria-label={`выполнить: ${task.title}`}
          title={PRIORITY_LABEL[task.priority]}
        >
          <span className={`check prio-${task.priority}`} />
        </button>
        <button className="focus-main" onClick={() => openTask(task.id)}>
          <span className="focus-title">{task.title}</span>
          {(project || task.due_date || (stats && stats.total > 0)) && (
            <span className="task-meta">
              {project && (
                <>
                  <span className="dot" style={{ background: project.color }} />
                  {project.name}
                </>
              )}
              {stats && stats.total > 0 && (
                <span className="mono-num">
                  {project && ' · '}
                  {stats.done}/{stats.total}
                </span>
              )}
              {task.due_date && (
                <span className={`badge ${overdue ? 'badge-danger' : ''}`} title="дедлайн">
                  {shortDate(task.due_date)}
                </span>
              )}
            </span>
          )}
        </button>
      </div>
    </section>
  )
}
