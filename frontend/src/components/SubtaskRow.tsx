import { useState, type FormEvent } from 'react'
import type { Task } from '../api/types'
import { TITLE_MAX } from '../lib/format'
import { CheckIcon, PlusIcon } from './icons'

interface RowProps {
  task: Task
  onToggle: () => void
  onOpen: () => void
}

/** Подзадача: квадратный чекбокс (у задач — круглый), заголовок открывает её карточку. */
export function SubtaskRow({ task, onToggle, onOpen }: RowProps) {
  return (
    <li className={`subtask-row ${task.done ? 'done' : ''}`}>
      <button
        className="subcheck-hit"
        onClick={onToggle}
        aria-label={task.done ? `вернуть подзадачу: ${task.title}` : `выполнить подзадачу: ${task.title}`}
        aria-pressed={task.done}
      >
        <span className={`subcheck ${task.done ? 'checked' : ''}`}>{task.done && <CheckIcon />}</span>
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
}

export function SubtaskList({ subtasks, onToggle, onOpen }: ListProps) {
  return (
    <ul className="subtask-list">
      {subtasks.map((s) => (
        <SubtaskRow key={s.id} task={s} onToggle={() => onToggle(s)} onOpen={() => onOpen(s)} />
      ))}
    </ul>
  )
}

interface AdderProps {
  label: string // «подзадача» в строке списка, «добавить подзадачу» в карточке
  variant: 'chip' | 'link'
  onAdd: (title: string) => Promise<boolean>
}

/** Кнопка добавления подзадачи; по нажатию превращается в поле, после ввода остаётся открытой. */
export function SubtaskAdder({ label, variant, onAdd }: AdderProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    if (await onAdd(t)) setTitle('')
    setBusy(false)
  }

  if (!open) {
    return (
      <button className={`subtask-adder ${variant}`} onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </button>
    )
  }

  return (
    <form className="subtask-add" onSubmit={submit}>
      <PlusIcon />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (!title.trim()) setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="новая подзадача"
        aria-label="новая подзадача"
        maxLength={TITLE_MAX}
        enterKeyHint="done"
        readOnly={busy}
        autoFocus
      />
    </form>
  )
}
