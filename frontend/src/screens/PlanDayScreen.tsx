import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorText } from '../api/client'
import type { Project, Task } from '../api/types'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorState } from '../components/ErrorState'
import { SkeletonRows } from '../components/Skeleton'
import { CheckIcon, PlusIcon } from '../components/icons'
import { useProjects } from '../hooks/useProjects'
import { useSuggestions } from '../hooks/useDay'
import { daysBetween, shortDate, toDateStr } from '../lib/date'
import { plural, pluralTasks } from '../lib/format'

/**
 * «Собрать день» (макет A2): три секции подсказок, у каждой строки круглая кнопка
 * «+» / галочка. Выбор локальный; «начать день» шлёт один POST /day/plan и уводит на /today.
 */
export function PlanDayScreen() {
  const navigate = useNavigate()
  const { date, suggestions, plannedCount, loading, error, reload, commit } = useSuggestions()
  const { all: projects } = useProjects()
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const projectById = new Map(projects.map((p) => [p.id, p]))
  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const total = plannedCount + picked.size
  const start = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await commit([...picked])
      navigate('/today')
    } catch (e) {
      setSaveError(errorText(e))
      setSaving(false)
    }
  }

  const s = suggestions
  const empty = s !== null && s.overdue.length + s.due_soon.length + s.stale.length === 0

  const rowProps = (t: Task) => ({
    task: t,
    project: t.project_id !== null ? projectById.get(t.project_id) : undefined,
    picked: picked.has(t.id),
    onToggle: () => toggle(t.id),
  })

  return (
    <div className="screen plan-screen">
      <ScreenHeader back="/today" title="Собрать день">
        <p className="plan-hint">выбери 5–7 задач — остальные останутся в списках и не будут мозолить глаза</p>
      </ScreenHeader>

      {loading && !s ? (
        <SkeletonRows count={5} />
      ) : error && !s ? (
        <ErrorState message={error} onRetry={() => reload()} />
      ) : empty ? (
        <div className="empty">
          <span className="empty-title">предложить нечего</span>
          <span className="empty-hint">просроченного нет, дедлайнов на неделе нет, всё без дат трогали недавно</span>
        </div>
      ) : (
        s && (
          <>
            {s.overdue.length > 0 && (
              <section className="task-section">
                <div className="section-label tone-overdue">просрочено · {s.overdue.length}</div>
                {s.overdue.map((t) => (
                  <PlanRow key={t.id} {...rowProps(t)} aside={shortDate(t.due_date!)} danger />
                ))}
              </section>
            )}
            {s.due_soon.length > 0 && (
              <section className="task-section">
                <div className="section-label">дедлайн на этой неделе · {s.due_soon.length}</div>
                {s.due_soon.map((t) => (
                  <PlanRow key={t.id} {...rowProps(t)} aside={shortDate(t.due_date!)} />
                ))}
              </section>
            )}
            {s.stale.length > 0 && (
              <section className="task-section">
                <div className="section-label plan-stale-head">
                  <span>из списков</span>
                  <span className="plan-stale-note">давно не трогал</span>
                </div>
                {s.stale.map((t) => (
                  <PlanRow key={t.id} {...rowProps(t)} aside={idleLabel(t, date)} />
                ))}
              </section>
            )}
          </>
        )
      )}

      <div className="plan-footer">
        {saveError && <div className="inline-error">{saveError}</div>}
        <button className="btn btn-primary btn-big plan-start" disabled={saving || total === 0} onClick={start}>
          начать день
          {total > 0 && <span className="plan-start-count">{pluralTasks(total)}</span>}
        </button>
      </div>
    </div>
  )
}

/** Сколько дней задачу не трогали: «21 день». */
function idleLabel(t: Task, today: string): string {
  const n = Math.max(0, daysBetween(toDateStr(new Date(t.updated_at)), today))
  return `${n} ${plural(n, ['день', 'дня', 'дней'])}`
}

interface RowProps {
  task: Task
  project?: Project
  aside: string
  danger?: boolean
  picked: boolean
  onToggle: () => void
}

function PlanRow({ task, project, aside, danger, picked, onToggle }: RowProps) {
  return (
    <div className={`plan-row ${picked ? 'picked' : ''}`}>
      <div className="plan-main">
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {project ? (
            <>
              <span className="dot" style={{ background: project.color }} />
              {project.name}
            </>
          ) : (
            'входящие'
          )}
          <span className="meta-sep"> · </span>
          <span className={`mono-num ${danger ? 'tone-danger-text' : ''}`}>{aside}</span>
        </span>
      </div>
      <button
        className="plan-toggle-hit"
        onClick={onToggle}
        aria-pressed={picked}
        aria-label={`${picked ? 'убрать из плана' : 'добавить в план'}: ${task.title}`}
      >
        <span className="plan-toggle">{picked ? <CheckIcon /> : <PlusIcon />}</span>
      </button>
    </div>
  )
}
