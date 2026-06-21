import { useState, type RefObject } from 'react'
import { useSpeech } from '../hooks/useSpeech'
import type { Priority } from '../lib/format'
import { MicIcon, PlusIcon, SpinIcon } from './icons'

interface Props {
  inputRef: RefObject<HTMLInputElement | null>
  onAdd: (title: string, priority: Priority) => Promise<void>
}

const PRIORITIES: Priority[] = ['high', 'medium', 'low']

export function AddForm({ inputRef, onAdd }: Props) {
  const [input, setInput] = useState('')
  const [priority, setPriority] = useState<Priority>('low')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { listening, supported, start, stop } = useSpeech((text) => {
    setInput(text)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  })

  async function handleAdd() {
    const title = input.trim()
    if (!title) return
    setAdding(true)
    setError(null)
    try {
      await onAdd(title, priority)
      setInput('')
      setPriority('low')
      inputRef.current?.focus()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="add-form">
      <div className={`add-input-wrap ${error ? 'has-error' : ''} ${listening ? 'is-listening' : ''}`}>
        <span className="prompt" aria-hidden="true">›</span>
        <input
          ref={inputRef}
          className="add-input"
          placeholder={listening ? 'слушаю...' : 'новая задача...'}
          aria-label="Новая задача"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          disabled={adding}
          autoFocus
        />

        {supported && (
          <button
            className={`mic-btn ${listening ? 'active' : ''}`}
            onClick={listening ? stop : start}
            aria-label={listening ? 'Остановить запись' : 'Голосовой ввод'}
            aria-pressed={listening}
            type="button"
          >
            <MicIcon listening={listening} />
          </button>
        )}

        <div className="priority-selector" role="group" aria-label="Приоритет новой задачи">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`priority-dot priority-${p} ${priority === p ? 'active' : ''}`}
              onClick={() => setPriority(p)}
              aria-label={`Приоритет: ${p}`}
              aria-pressed={priority === p}
            />
          ))}
        </div>

        <button
          className={`add-btn ${adding ? 'loading' : ''}`}
          onClick={handleAdd}
          disabled={adding || !input.trim()}
          aria-label="Добавить задачу"
          type="button"
        >
          {adding ? <SpinIcon /> : <PlusIcon />}
        </button>
      </div>
      {error && <p className="add-error" role="alert">{error}</p>}
    </div>
  )
}
