import { useState, type FormEvent } from 'react'
import { TITLE_MAX } from '../lib/format'
import { PlusIcon, SpinIcon } from './icons'

interface Props {
  placeholder: string
  onAdd: (title: string) => Promise<boolean>
}

/** Поле быстрого добавления внизу экрана списка. Разбор #списка/!приоритета/дат — Этап 5. */
export function QuickAdd({ placeholder, onAdd }: Props) {
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

  return (
    <form className="quick-add" onSubmit={submit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label="новая задача"
        maxLength={TITLE_MAX}
        enterKeyHint="done"
      />
      <button type="submit" className="quick-add-btn" disabled={!title.trim() || busy} aria-label="добавить">
        {busy ? <SpinIcon /> : <PlusIcon />}
      </button>
    </form>
  )
}
