import { useState } from 'react'
import type { DragControls } from 'framer-motion'
import type { DateStr, Project, Task } from '../api/types'
import { useTask } from '../hooks/useTasks'
import { dateLabel } from '../lib/date'
import { PRIORITY_LABEL } from '../lib/format'
import { SubtaskList } from './SubtaskRow'
import { useOpenTask } from './TaskSheet'
import { CalendarIcon, CheckIcon, ChevronIcon, FlagIcon, GripIcon, SpinIcon } from './icons'

interface Props {
  task: Task
  today: DateStr
  project?: Project // показываем метку списка в смарт-видах
  dragControls?: DragControls // нет — строку не перетаскивают
  gripSpace?: boolean // место под ручку без неё: строки одного списка выровнены по правому краю
  onToggle: () => void
}

export function TaskRow({ task, today, project, dragControls, gripSpace, onToggle }: Props) {
  const [expanded, setExpanded] = useState(false)
  const openTask = useOpenTask()
  const stats = task.subtask_stats
  const overdue = task.due_date !== null && task.due_date < today

  return (
    <div className={`task ${task.done ? 'done' : ''}`}>
      <div className="task-row">
        <button
          className="check-hit"
          onClick={onToggle}
          aria-label={task.done ? 'вернуть задачу' : 'выполнить задачу'}
          aria-pressed={task.done}
          title={PRIORITY_LABEL[task.priority]}
        >
          <span className={`check prio-${task.priority} ${task.done ? 'checked' : ''}`}>
            {task.done && <CheckIcon />}
          </span>
        </button>

        <button className="task-main" onClick={() => openTask(task.id)}>
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            {project && (
              <span className="meta-project">
                <span className="dot" style={{ background: project.color }} />
                {project.name}
              </span>
            )}
            {task.due_date && (
              <span className={`meta-date ${overdue ? 'overdue' : ''}`} title="дедлайн">
                <FlagIcon />
                {dateLabel(task.due_date, today)}
              </span>
            )}
            {task.scheduled_for && task.scheduled_for !== task.due_date && (
              <span className="meta-date" title="делаю">
                <CalendarIcon />
                {dateLabel(task.scheduled_for, today)}
              </span>
            )}
          </span>
        </button>

        <button
          className={`expand-btn ${expanded ? 'open' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'свернуть подзадачи' : 'показать подзадачи'}
        >
          {stats && stats.total > 0 && (
            <span className="mono-num">
              {stats.done}/{stats.total}
            </span>
          )}
          <ChevronIcon open={expanded} />
        </button>

        {!dragControls && gripSpace && <span className="grip-space" aria-hidden="true" />}
        {dragControls && (
          <span
            className="grip"
            onPointerDown={(e) => {
              e.preventDefault()
              dragControls.start(e)
            }}
            aria-hidden="true"
          >
            <GripIcon />
          </span>
        )}
      </div>

      {expanded && <SubtaskPanel parentId={task.id} />}
    </div>
  )
}

/** Раскрытая строка: подзадачи грузятся по требованию из GET /tasks/{id}. */
function SubtaskPanel({ parentId }: { parentId: number }) {
  const { task, loading, error, actionError, addSubtask, updateSubtask } = useTask(parentId)
  const openTask = useOpenTask()

  if (loading && !task) {
    return (
      <div className="subtasks subtasks-loading">
        <SpinIcon />
      </div>
    )
  }
  if (error || !task) return <div className="subtasks inline-error">{error ?? 'задача не найдена'}</div>

  return (
    <>
      <SubtaskList
        subtasks={task.subtasks ?? []}
        onToggle={(s) => updateSubtask(s.id, { done: !s.done })}
        onOpen={(s) => openTask(s.id)}
        onAdd={addSubtask}
      />
      {actionError && <div className="inline-error">{actionError}</div>}
    </>
  )
}
