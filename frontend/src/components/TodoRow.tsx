import { useEffect, useRef, type ReactNode } from 'react'
import type { Task } from '../api'
import { formatDate, isDailyTask, nextPriority, PRIORITY_LABEL } from '../lib/format'
import { CheckIcon, DailyStarIcon, TrashIcon } from './icons'

interface Props {
  todo: Task
  isDeleting?: boolean
  isEditing: boolean
  editVal: string
  dragHandle?: ReactNode
  onToggle: () => void
  onDelete: () => void
  onStartEdit: () => void
  onEditChange: (v: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onPriorityChange: (p: string) => void
  onToggleDaily: () => void
}

export function TodoRow({
  todo,
  isDeleting,
  isEditing,
  editVal,
  dragHandle,
  onToggle,
  onDelete,
  onStartEdit,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onPriorityChange,
  onToggleDaily,
}: Props) {
  const editRef = useRef<HTMLInputElement>(null)
  const priority = todo.priority || 'low'
  const daily = isDailyTask(todo)

  useEffect(() => {
    if (isEditing) editRef.current?.focus()
  }, [isEditing])

  return (
    <div className={`todo-row ${todo.done ? 'done' : ''} ${isDeleting ? 'deleting' : ''} ${daily ? 'daily' : ''} priority-${priority}`}>
      {dragHandle}

      <button
        className="priority-bar"
        onClick={() => onPriorityChange(nextPriority(priority))}
        aria-label={`Приоритет: ${PRIORITY_LABEL[priority]} — нажмите, чтобы сменить`}
      />

      <button
        className="check-btn"
        onClick={onToggle}
        role="checkbox"
        aria-checked={todo.done}
        aria-label={todo.done ? `Снять отметку: ${todo.title}` : `Выполнить: ${todo.title}`}
      >
        <span className="check-box">{todo.done ? <CheckIcon /> : null}</span>
      </button>

      <div className="todo-content">
        {isEditing ? (
          <input
            ref={editRef}
            className="edit-input"
            value={editVal}
            aria-label="Редактировать задачу"
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditCommit()
              if (e.key === 'Escape') onEditCancel()
            }}
            onBlur={onEditCommit}
          />
        ) : (
          <span className="todo-title" onDoubleClick={onStartEdit} title="Двойной клик — редактировать">
            {todo.title}
          </span>
        )}
        <div className="todo-meta">
          {todo.created_at && <span className="todo-date">{formatDate(todo.created_at)}</span>}
        </div>
      </div>

      <button
        className={`daily-btn ${daily ? 'active' : ''}`}
        onClick={onToggleDaily}
        aria-pressed={daily}
        aria-label={daily ? `Убрать из «на сегодня»: ${todo.title}` : `В «на сегодня»: ${todo.title}`}
        title={daily ? 'Убрать из «на сегодня»' : 'В «на сегодня»'}
      >
        <DailyStarIcon filled={daily} />
      </button>

      <button className="del-btn" onClick={onDelete} aria-label={`Удалить: ${todo.title}`}>
        <TrashIcon />
      </button>
    </div>
  )
}
