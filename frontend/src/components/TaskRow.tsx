import { useEffect, useRef, useState } from 'react'
import type { DragControls } from 'framer-motion'
import type { DateStr, Project, Task } from '../api/types'
import { useTask } from '../hooks/useTasks'
import { shortDate } from '../lib/date'
import { PRIORITY_LABEL } from '../lib/format'
import { NativeDateInput } from './DatePicker'
import { SubtaskAdder, SubtaskList } from './SubtaskRow'
import { SwipeRow } from './SwipeRow'
import { useOpenTask } from './TaskSheet'
import { CalendarIcon, CheckIcon, GripIcon, SpinIcon } from './icons'

interface Props {
  task: Task
  today: DateStr
  project?: Project // показываем метку списка в смарт-видах
  dragControls?: DragControls // нет — строку не перетаскивают
  gripSpace?: boolean // место под ручку без неё: строки одного списка выровнены по правому краю
  alert?: boolean // красная рамка и без дедлайна: блок «просрочено» на «Сегодня» (вчера не доделал)
  onToggle: () => void
  onSetDue: (d: DateStr | null) => void
  onDelete?: () => void // свайп влево
  onToday?: () => void // свайп вправо; у задачи, уже стоящей на сегодня, не предлагается
}

/**
 * Строка задачи (макет B2): круглый чекбокс цвета приоритета, заголовок, справа бейджи —
 * прогресс подзадач (раскрывает их) и дата. Без дат — кнопка «назначить дедлайн».
 */
export function TaskRow({
  task,
  today,
  project,
  dragControls,
  gripSpace,
  alert,
  onToggle,
  onSetDue,
  onDelete,
  onToday,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const openTask = useOpenTask()
  const stats = task.subtask_stats
  const overdue = task.due_date !== null && task.due_date < today
  const red = (overdue || alert) && !task.done

  let dateBadge = null
  if (task.due_date) {
    dateBadge = (
      <span className={`badge ${overdue ? 'badge-danger' : ''}`} title="дедлайн">
        {shortDate(task.due_date)}
      </span>
    )
  } else if (task.scheduled_for) {
    dateBadge = (
      <span className="badge" title="делаю">
        <CalendarIcon />
        {shortDate(task.scheduled_for)}
      </span>
    )
  } else {
    dateBadge = (
      <label className="date-assign">
        <CalendarIcon />
        <NativeDateInput value={null} label={`назначить дедлайн: ${task.title}`} onChange={onSetDue} />
      </label>
    )
  }

  const row = (
    <div className={`task ${task.done ? 'done' : ''} ${red ? 'overdue' : ''}`}>
      <div className="task-row">
        <button
          className="check-hit"
          onClick={onToggle}
          aria-label={`${task.done ? 'вернуть' : 'выполнить'}: ${task.title}`}
          aria-pressed={task.done}
          title={PRIORITY_LABEL[task.priority]}
        >
          <span className={`check prio-${task.priority} ${task.done ? 'checked' : ''}`}>
            {task.done && <CheckIcon />}
          </span>
        </button>

        <button className="task-main" onClick={() => openTask(task.id)}>
          <span className={`task-title ${expanded ? 'strong' : ''}`}>{task.title}</span>
          {project && (
            <span className="task-meta">
              <span className="dot" style={{ background: project.color }} />
              {project.name}
            </span>
          )}
        </button>

        <span className="task-badges">
          {stats && stats.total > 0 && (
            <button
              className="badge badge-btn"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'свернуть' : 'показать'} подзадачи: ${stats.done} из ${stats.total}`}
            >
              {stats.done}/{stats.total}
            </button>
          )}
          {!expanded && dateBadge}
        </span>

        {dragControls ? (
          <Grip controls={dragControls} />
        ) : (
          gripSpace && <span className="grip-space" aria-hidden="true" />
        )}
      </div>

      {expanded && <SubtaskPanel parentId={task.id} dueDate={task.due_date} />}
    </div>
  )

  if (!onDelete && !onToday) return row
  return (
    <SwipeRow
      title={task.title}
      onDelete={onDelete}
      onToday={onToday && task.scheduled_for !== today && !task.done ? onToday : undefined}
    >
      {row}
    </SwipeRow>
  )
}

/**
 * Ручка перетаскивания. Слушатель нативный: строка внутри SwipeRow сама слушает pointerdown
 * (drag="x"), а React-обработчик сработал бы уже после неё — и строка поехала бы вбок.
 */
function Grip({ controls }: { controls: DragControls }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      controls.start(e)
    }
    el.addEventListener('pointerdown', onDown)
    return () => el.removeEventListener('pointerdown', onDown)
  }, [controls])

  return (
    <span className="grip" ref={ref} aria-hidden="true">
      <GripIcon />
    </span>
  )
}

/** Раскрытая строка: подзадачи грузятся по требованию из GET /tasks/{id}. */
function SubtaskPanel({ parentId, dueDate }: { parentId: number; dueDate: DateStr | null }) {
  const { task, loading, error, actionError, addSubtask, updateSubtask } = useTask(parentId)
  const openTask = useOpenTask()

  if (loading && !task) {
    return (
      <div className="task-subtasks subtasks-loading">
        <SpinIcon />
      </div>
    )
  }
  if (error || !task) return <div className="task-subtasks inline-error">{error ?? 'задача не найдена'}</div>

  return (
    <div className="task-subtasks">
      <SubtaskList
        subtasks={task.subtasks ?? []}
        onToggle={(s) => updateSubtask(s.id, { done: !s.done })}
        onOpen={(s) => openTask(s.id)}
      />
      <div className="task-subtasks-footer">
        {dueDate && <span className="badge badge-warn">до {shortDate(dueDate)}</span>}
        <SubtaskAdder label="подзадача" variant="chip" onAdd={addSubtask} />
      </div>
      {actionError && <div className="inline-error">{actionError}</div>}
    </div>
  )
}
