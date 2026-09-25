import { useRef, useState } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import type { DateStr, Project, Task, Week } from '../api/types'
import { DayDrag } from '../components/DayDrag'
import { DoneRow } from '../components/DoneRow'
import { ErrorState } from '../components/ErrorState'
import { QuickAdd } from '../components/QuickAdd'
import { Logo } from '../components/ScreenHeader'
import { SkeletonRows } from '../components/Skeleton'
import { TaskRow } from '../components/TaskRow'
import { BackIcon } from '../components/icons'
import { useOpenTask } from '../hooks/useOpenTask'
import { useProjects } from '../hooks/useProjects'
import { useWeek } from '../hooks/useWeek'
import {
  addDays,
  dayOfMonth,
  daysBetween,
  longDayLabel,
  mondayOf,
  shortDate,
  todayStr,
  weekdayShort,
  weekTitle,
} from '../lib/date'
import { plural } from '../lib/format'
import type { QuickParse } from '../lib/quickAdd'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DOTS = 3

/**
 * «Неделя» (макет C1): полоса пн–вс со счётчиками, список выбранного дня, дедлайны после недели
 * и бэклог без дат. Задачу тащат на день полосы: строку — за ручку, чип бэклога — целиком
 * (нажатие на чип ставит его на выбранный день). Неделя и день живут в ?from=&day=.
 */
export function WeekScreen() {
  const [params, setParams] = useSearchParams()
  const today = todayStr()
  const fromParam = params.get('from')
  const from = mondayOf(fromParam && DATE_RE.test(fromParam) ? fromParam : today)
  const to = addDays(from, 6)
  const dayParam = params.get('day')
  const inWeek = (d: string | null): d is DateStr => d !== null && DATE_RE.test(d) && d >= from && d <= to
  const selected = inWeek(dayParam) ? dayParam : inWeek(today) ? today : from
  const isCurrent = from === mondayOf(today)

  const { week, staleWeek, loading, error, actionError, clearActionError, reload, toggle, schedule, update, remove, add } =
    useWeek(from)
  const { projects, all: allProjects } = useProjects()
  const projectById = new Map(allProjects.map((p) => [p.id, p]))
  const projectOf = (t: Task) => (t.project_id !== null ? projectById.get(t.project_id) : undefined)
  const [dropDay, setDropDay] = useState<DateStr | null>(null)

  const go = (nextFrom: DateStr, day?: DateStr) => {
    const p = new URLSearchParams(params)
    p.set('from', nextFrom)
    if (day) p.set('day', day)
    else p.delete('day')
    setParams(p, { replace: true })
  }
  const pick = (day: DateStr) => go(from, day)

  const shown = week ?? (staleWeek && staleWeek.from === from ? staleWeek : null)
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const dayData = shown?.days.find((d) => d.date === selected)

  const addTask = async (p: QuickParse) => {
    const created = await add({
      title: p.title,
      project_id: p.project?.id ?? null,
      priority: p.priority,
      due_date: p.dueDate,
      scheduled_for: p.scheduledFor ?? selected,
    })
    if (!created) return null
    const when = created.scheduled_for
    return when && when !== selected ? { hint: `добавлено на ${shortDate(when)}` } : {}
  }

  const dropOn = (task: Task) => (day: DateStr) => schedule(task, day)

  return (
    <div className="screen week-screen">
      <div className="eyebrow">
        <Logo />
      </div>

      <header className="week-head">
        <h1 className="screen-title">{weekTitle(from, to, today)}</h1>
        <div className="week-nav">
          {!isCurrent && (
            <button className="chip chip-mono" onClick={() => go(mondayOf(today))}>
              сегодня
            </button>
          )}
          <button className="box-btn" onClick={() => go(addDays(from, -7))} aria-label="предыдущая неделя">
            <span className="box">
              <BackIcon />
            </span>
          </button>
          <button className="box-btn" onClick={() => go(addDays(from, 7))} aria-label="следующая неделя">
            <span className="box box-flip">
              <BackIcon />
            </span>
          </button>
        </div>
      </header>

      <WeekStrip
        days={days}
        week={shown}
        today={today}
        selected={selected}
        dropDay={dropDay}
        projectOf={projectOf}
        onPick={pick}
        onSwipe={(dir) => go(addDays(from, dir * 7))}
      />

      {error && shown && (
        <button className="error-bar" onClick={() => reload()}>
          {error} · повторить
        </button>
      )}
      {actionError && (
        <button className="error-bar" onClick={clearActionError}>
          {actionError}
        </button>
      )}

      {!shown ? (
        error ? (
          <ErrorState message={error} onRetry={() => reload()} />
        ) : (
          loading && <SkeletonRows count={4} />
        )
      ) : (
        <>
          <div className="week-day-head">
            <span className="week-day-title">{longDayLabel(selected)}</span>
            {dayData && (
              <span className="mono-num muted">
                {dayData.scheduled.length}
                {dayData.deadlines.length > 0 &&
                  ` · ${dayData.deadlines.length} ${plural(dayData.deadlines.length, ['дедлайн', 'дедлайна', 'дедлайнов'])}`}
              </span>
            )}
          </div>

          {dayData && (
            <ul className="task-list week-list">
              {[...dayData.deadlines, ...dayData.scheduled].map((t) => (
                <li key={`${t.id}-${t.scheduled_for === selected ? 's' : 'd'}`}>
                  <DayDrag onHover={setDropDay} onDrop={dropOn(t)}>
                    {(controls) => (
                      <TaskRow
                        task={t}
                        today={today}
                        project={projectOf(t)}
                        dragControls={controls}
                        alert={t.due_date === selected && selected <= today}
                        onToggle={() => toggle(t)}
                        onSetDue={(d) => update(t.id, { due_date: d })}
                        onDelete={() => remove(t.id)}
                        onToday={() => schedule(t, today)}
                      />
                    )}
                  </DayDrag>
                </li>
              ))}
              {dayData.done.map((t) => (
                <li key={`${t.id}-done`}>
                  <DoneRow task={t} project={projectOf(t)} onUndo={() => toggle(t)} />
                </li>
              ))}
            </ul>
          )}
          {dayData && dayData.scheduled.length + dayData.deadlines.length + dayData.done.length === 0 && (
            <div className="empty week-empty">
              <span className="empty-hint">на этот день ничего — перетащи задачу из бэклога или добавь ниже</span>
            </div>
          )}

          <QuickAdd
            inline
            placeholder={`задача на ${weekdayShort(selected)}, ${shortDate(selected)}…`}
            label={`новая задача на ${longDayLabel(selected)}`}
            projects={projects}
            onAdd={addTask}
          />

          {shown.upcoming.length > 0 && (
            <section className="task-section">
              <div className="section-label">дедлайны впереди</div>
              <Upcoming tasks={shown.upcoming} today={today} />
            </section>
          )}

          <Backlog
            week={shown}
            selected={selected}
            projectOf={projectOf}
            onHover={setDropDay}
            onSchedule={schedule}
          />
        </>
      )}
    </div>
  )
}

interface StripProps {
  days: DateStr[]
  week: Week | null
  today: DateStr
  selected: DateStr
  dropDay: DateStr | null
  projectOf: (t: Task) => Project | undefined
  onPick: (d: DateStr) => void
  onSwipe: (dir: -1 | 1) => void
}

/** Полоса пн–вс: число, день недели и до трёх точек цвета списков. Свайп вбок листает недели. */
function WeekStrip({ days, week, today, selected, dropDay, projectOf, onPick, onSwipe }: StripProps) {
  const panned = useRef(false)

  const onPanEnd = (_: unknown, info: PanInfo) => {
    const { x, y } = info.offset
    if (Math.abs(x) > 50 && Math.abs(x) > Math.abs(y) * 1.5) {
      panned.current = true
      onSwipe(x < 0 ? 1 : -1)
    }
  }

  return (
    <motion.div className="week-strip" role="tablist" aria-label="дни недели" onPanEnd={onPanEnd}>
      {days.map((d, i) => {
        const data = week?.days.find((x) => x.date === d)
        const tasks = data ? [...data.scheduled, ...data.deadlines] : []
        const cls = [
          'week-cell',
          d === selected && 'selected',
          d === today && 'today',
          i >= 5 && 'weekend',
          d < today && 'past',
          d === dropDay && 'drop',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={d}
            data-day={d}
            role="tab"
            aria-selected={d === selected}
            className={cls}
            onClick={() => {
              if (panned.current) {
                panned.current = false
                return
              }
              onPick(d)
            }}
            aria-label={`${longDayLabel(d)}${d === today ? ', сегодня' : ''}, ${tasks.length} ${plural(tasks.length, ['задача', 'задачи', 'задач'])}`}
          >
            <span className="week-cell-wd">{weekdayShort(d)}</span>
            <span className="week-cell-num">{dayOfMonth(d)}</span>
            <span className="week-cell-dots" aria-hidden="true">
              {tasks.slice(0, MAX_DOTS).map((t) => (
                <span key={t.id} className="week-dot" style={{ background: projectOf(t)?.color }} />
              ))}
            </span>
          </button>
        )
      })}
    </motion.div>
  )
}

/** Дедлайны после недели карточками в ряд: «04.10 · 13 дн» и заголовок. */
function Upcoming({ tasks, today }: { tasks: Task[]; today: DateStr }) {
  const openTask = useOpenTask()
  return (
    <div className="upcoming">
      {tasks.map((t) => {
        const left = daysBetween(today, t.due_date!)
        return (
          <button key={t.id} className="upcoming-card" onClick={() => openTask(t.id)}>
            <span className={`upcoming-date ${left <= 14 ? 'soon' : ''}`}>
              {shortDate(t.due_date!)} · {left} {plural(left, ['день', 'дня', 'дней'])}
            </span>
            <span className="upcoming-title">{t.title}</span>
          </button>
        )
      })}
    </div>
  )
}

interface BacklogProps {
  week: Week
  selected: DateStr
  projectOf: (t: Task) => Project | undefined
  onHover: (d: DateStr | null) => void
  onSchedule: (t: Task, d: DateStr) => void
}

/** Бэклог — задачи без дат. Чип тащат на день полосы или нажимают — встанет на выбранный день. */
function Backlog({ week, selected, projectOf, onHover, onSchedule }: BacklogProps) {
  if (week.backlog_total === 0) return null
  const more = week.backlog_total - week.backlog.length
  return (
    <section className="task-section backlog">
      <div className="section-label backlog-head">
        <span>
          бэклог · <span className="mono-num">{week.backlog_total}</span>
        </span>
        <span className="backlog-hint">тяни на день ↑ или нажми — на {weekdayShort(selected)}</span>
      </div>
      <div className="backlog-chips">
        {week.backlog.map((t) => (
          <DayDrag
            key={t.id}
            whole
            className="backlog-drag"
            onHover={onHover}
            onDrop={(d) => onSchedule(t, d)}
            onTap={() => onSchedule(t, selected)}
          >
            {() => (
              <span
                className="backlog-chip"
                role="button"
                tabIndex={0}
                aria-label={`${t.title}: поставить на ${longDayLabel(selected)}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSchedule(t, selected)
                  }
                }}
              >
                {projectOf(t) && <span className="dot" style={{ background: projectOf(t)!.color }} />}
                {t.title}
              </span>
            )}
          </DayDrag>
        ))}
        {more > 0 && <span className="backlog-more mono-num">+ ещё {more}</span>}
      </div>
    </section>
  )
}
