import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { Project, Task } from '../api/types'
import { AnimatedRow } from '../components/AnimatedRow'
import { DoneRow } from '../components/DoneRow'
import { EmptyState } from '../components/EmptyState'
import { ProgressRing } from '../components/ProgressRing'
import { Logo } from '../components/ScreenHeader'
import { TaskRow } from '../components/TaskRow'
import { TaskRun } from '../components/TaskRun'
import { useCompleting } from '../hooks/useCompleting'
import { useOpenTask } from '../hooks/useOpenTask'
import { ErrorState } from '../components/ErrorState'
import { SkeletonBlock, SkeletonRows } from '../components/Skeleton'
import { AlertIcon, CheckIcon, ChevronIcon, PlusIcon } from '../components/icons'
import { useDay } from '../hooks/useDay'
import { useProjects } from '../hooks/useProjects'
import { dayHeading, greeting, shortDate } from '../lib/date'
import { PRIORITY_LABEL, daySummary } from '../lib/format'

/**
 * Экран «Сегодня» (макет A1): прогресс дня, фокус — первая задача плана, красный блок
 * «просрочено» (дедлайн прошёл или вчера не доделал), план на день и свёрнутое «готово».
 */
export function TodayScreen() {
  const {
    day,
    loading,
    error,
    actionError,
    clearActionError,
    reload,
    toggle,
    update,
    remove,
    moveToToday,
    reorderPlanned,
  } = useDay()
  const { all: projects } = useProjects()
  const [showDone, setShowDone] = useState(false)

  const projectById = new Map(projects.map((p) => [p.id, p]))
  const projectOf = (t: Task) => (t.project_id !== null ? projectById.get(t.project_id) : undefined)
  // одни функции на все строки (TaskRow — memo)
  const setDue = (t: Task, d: string | null) => update(t.id, { due_date: d })
  const removeTask = (t: Task) => remove(t.id)
  const toToday = (t: Task) => moveToToday([t.id])

  if (!day) {
    return (
      <div className="screen">
        <div className="eyebrow">
          <Logo />
        </div>
        <DayHeader done={0} total={0} late={0} pending />
        {error ? (
          <ErrorState message={error} onRetry={() => reload()} />
        ) : (
          loading && (
            <>
              <SkeletonBlock height={96} />
              <SkeletonRows count={4} />
            </>
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
      <DayHeader done={doneCount} total={total} late={late.length} />

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
            <AnimatePresence initial={false}>
              {late.map((t) => (
                <AnimatedRow key={t.id} id={t.id}>
                  <TaskRow
                    task={t}
                    today={today}
                    project={projectOf(t)}
                    alert
                    onToggle={toggle}
                    onSetDue={setDue}
                    onDelete={removeTask}
                    onToday={toToday}
                  />
                </AnimatedRow>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {!focus ? (
        <EmptyState
          art="sun"
          title="день пока свободен"
          hint="возьми пару задач из списков — просроченное и дедлайны недели подскажут"
        >
          <Link to="/plan" className="btn btn-primary">
            собрать день
          </Link>
        </EmptyState>
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
              onSetDue={setDue}
              onReorder={(ids) => reorderPlanned([focus.id, ...ids])}
              onDelete={removeTask}
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

/**
 * Шапка «Сегодня»: приветствие по времени суток, под ним — сколько осталось и что просрочено,
 * справа — кольцо прогресса дня. pending — данные ещё грузятся: только приветствие.
 */
function DayHeader({ done, total, late, pending }: { done: number; total: number; late: number; pending?: boolean }) {
  const all = total > 0 && done === total
  return (
    <header className="screen-header today-header">
      <div className="today-heading">
        <h1 className="screen-title today-title">{greeting(new Date().getHours())}</h1>
        {!pending && <p className={`today-summary ${all ? 'all-done' : ''}`}>{daySummary(done, total, late)}</p>}
      </div>
      {total > 0 && (
        <ProgressRing value={done / total} done={all} label={`выполнено ${done} из ${total}`}>
          {all ? <CheckIcon /> : <span className="today-ring-num">{done}/{total}</span>}
        </ProgressRing>
      )}
    </header>
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
  const check = useCompleting(false, onToggle)
  const stats = task.subtask_stats
  const overdue = task.due_date !== null && task.due_date < today

  return (
    <section className={`focus-card ${check.completing ? 'completing' : ''}`} aria-label="фокус дня">
      <span className="focus-label">фокус дня</span>
      <div className="focus-row">
        <button
          className="check-hit"
          onClick={check.onClick}
          aria-label={`выполнить: ${task.title}`}
          aria-pressed={check.checked}
          title={PRIORITY_LABEL[task.priority]}
        >
          <span className={`check prio-${task.priority} ${check.checked ? 'checked pop' : ''}`}>
            {check.checked && <CheckIcon />}
          </span>
        </button>
        <button className="focus-main" onClick={() => openTask(task.id, task)}>
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
