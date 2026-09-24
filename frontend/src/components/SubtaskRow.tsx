import { useState, type FormEvent } from 'react'
import type { Task } from '../api/types'
import { statsOf } from '../hooks/useTasks'
import { TITLE_MAX } from '../lib/format'
import { CheckIcon, PlusIcon } from './icons'

interface RowProps {
  task: Task
  onToggle: () => void
  onOpen: () => void
}

export function SubtaskRow({ task, onToggle, onOpen }: RowProps) {
  return (
    <li className={`subtask-row ${task.done ? 'done' : ''}`}>
      <button
        className="check-hit"
        onClick={onToggle}
        aria-label={task.done ? 'вернуть подзадачу' : 'выполнить подзадачу'}
        aria-pressed={task.done}
      >
        <span className={`check check-sm prio-${task.priority} ${task.done ? 'checked' : ''}`}>
          {task.done && <CheckIcon />}
        </span>
      </button>
      <button className="subtask-title" onClick={onOpen}>
        {task.title}
      </button>
    </li>
  )
}

interface ListProps {
  subtasks: Task[]
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
  onAdd: (title: string) => Promise<boolean>
}

/** Подзадачи с прогрессом «1/3» и строкой «+ подзадача». */
export function SubtaskList({ subtasks, onToggle, onOpen, onAdd }: ListProps) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const stats = statsOf(subtasks)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    if (await onAdd(t)) setTitle('')
    setBusy(false)
  }

  return (
    <div className="subtasks">
      {stats.total > 0 && (
        <div className="subtasks-progress">
          <span className="progress-track">
            <span className="progress-fill" style={{ width: `${(stats.done / stats.total) * 100}%` }} />
          </span>
          <span className="mono-num">
            {stats.done}/{stats.total}
          </span>
        </div>
      )}
      <ul className="subtask-list">
        {subtasks.map((s) => (
          <SubtaskRow key={s.id} task={s} onToggle={() => onToggle(s)} onOpen={() => onOpen(s)} />
        ))}
      </ul>
      <form className="subtask-add" onSubmit={submit}>
        <PlusIcon />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="подзадача"
          aria-label="новая подзадача"
          maxLength={TITLE_MAX}
          disabled={busy}
        />
      </form>
    </div>
  )
}
