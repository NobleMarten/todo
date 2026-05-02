import { useState, useEffect, useRef, useCallback } from 'react'
import React from 'react'
import {
  getTodos,
  addTodo,
  setDone,
  patchTodo,
  deleteTodo,
  clearTodos,
  Task,
  FilterDone,
  SortField,
} from './api'
import './index.css'

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function isToday(iso?: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

// ─── speech hook ──────────────────────────────────────────────────────────────

function useSpeech(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Голосовой ввод не поддерживается в этом браузере')
      return
    }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = '' // язык системы (авто)

    rec.onstart  = () => setListening(true)
    rec.onend    = () => setListening(false)
    rec.onerror  = () => setListening(false)
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript.trim()
      if (text) onResult(text)
    }

    recRef.current = rec
    rec.start()
  }, [onResult])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, start, stop }
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [todos,   setTodos]   = useState<Task[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // filters & sort
  const [filter, setFilter] = useState<FilterDone>('false')
  const [sort,   setSort]   = useState<SortField | ''>('')
  const [from,   setFrom]   = useState('')
  const [to,     setTo]     = useState('')

  // add
  const [input,    setInput]    = useState('')
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // inline edit
  const [editId,  setEditId]  = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')

  // animations
  const [deletingId,       setDeletingId]       = useState<number | null>(null)
  const [clearing,         setClearing]         = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── voice ─────────────────────────────────────────────────────────────────

  const { listening, start, stop } = useSpeech((text) => {
    setInput(text)
    setAddError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  })

  // ── load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // «активные» — fetch all, then client-side filter:
      // show undone + completed today (to see daily progress)
      const apiFilter = filter === 'false' ? 'all' as FilterDone : filter
      const data = await getTodos({
        done:  apiFilter,
        sort:  sort || undefined,
        from:  from || undefined,
        to:    to   || undefined,
      })
      let items = data.items ?? []
      if (filter === 'false') {
        items = items.filter(t => !t.done || isToday(t.done_at))
        // Сортируем: выполненные (done: true) идут вверх
        items.sort((a, b) => {
          if (a.done === b.done) return 0
          return a.done ? -1 : 1
        })
      }
      setTodos(items)
      setTotal(data.total ?? 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
      setTodos([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filter, sort, from, to])

  useEffect(() => { load() }, [load])

  // ── add ───────────────────────────────────────────────────────────────────

  async function handleAdd() {
    const title = input.trim()
    if (!title) return
    setAdding(true)
    setAddError(null)
    try {
      await addTodo(title)
      setInput('')
      await load()
      inputRef.current?.focus()
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setAdding(false)
    }
  }

  // ── toggle ────────────────────────────────────────────────────────────────

  async function handleToggle(todo: Task) {
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: !t.done } : t))
    try {
      await setDone(todo.id, !todo.done)
      await load()
    } catch {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: todo.done } : t))
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: number) {
    setDeletingId(id)
    setTimeout(async () => {
      try {
        await deleteTodo(id)
        await load()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Не удалось удалить')
      } finally {
        setDeletingId(null)
      }
    }, 280)
  }

  // ── clear ─────────────────────────────────────────────────────────────────

  async function handleClear() {
    setShowClearConfirm(false)
    setClearing(true)
    try {
      await clearTodos()
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось очистить')
    } finally {
      setClearing(false)
    }
  }

  // ── edit ──────────────────────────────────────────────────────────────────

  function startEdit(todo: Task) {
    setEditId(todo.id)
    setEditVal(todo.title)
  }

  async function commitEdit(id: number) {
    const title = editVal.trim()
    if (!title) { cancelEdit(); return }
    setEditId(null)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, title } : t))
    try {
      await patchTodo(id, { title })
    } catch {
      await load()
    }
  }

  function cancelEdit() {
    setEditId(null)
    setEditVal('')
  }

  // ─────────────────────────────────────────────────────────────────────────

  const doneCount = todos.filter(t => t.done).length

  return (
    <div className="app">
      <div className="grain" />

      <main className="container">

        {/* ── header ── */}
        <header className="header">
          <div className="header-left">
            <span className="logo-bracket">[</span>
            <span className="logo-text">todo</span>
            <span className="logo-bracket">]</span>
          </div>
          <div className="header-right">
            <div className="header-stats">
              <span className="stat">
                <span className="stat-num">{total}</span>
                <span className="stat-label"> total</span>
              </span>
              <span className="stat-dot">·</span>
              <span className="stat">
                <span className="stat-num accent">{doneCount}</span>
                <span className="stat-label"> done</span>
              </span>
            </div>

            {todos.length > 0 && !showClearConfirm && (
              <button
                className="clear-btn"
                onClick={() => setShowClearConfirm(true)}
                title="Очистить все задачи"
              >
                очистить
              </button>
            )}
            {showClearConfirm && (
              <div className="clear-confirm">
                <span>точно?</span>
                <button className="confirm-yes" onClick={handleClear} disabled={clearing}>
                  {clearing ? '...' : 'да'}
                </button>
                <button className="confirm-no" onClick={() => setShowClearConfirm(false)}>
                  нет
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── add form ── */}
        <div className="add-form">
          <div className={`add-input-wrap ${addError ? 'has-error' : ''} ${listening ? 'is-listening' : ''}`}>
            <span className="prompt">›</span>
            <input
              ref={inputRef}
              className="add-input"
              placeholder={listening ? 'слушаю...' : 'новая задача...'}
              value={input}
              onChange={e => { setInput(e.target.value); setAddError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              disabled={adding}
              autoFocus
            />
            <button
              className={`mic-btn ${listening ? 'active' : ''}`}
              onClick={listening ? stop : start}
              title={listening ? 'Остановить' : 'Голосовой ввод'}
              type="button"
            >
              <MicIcon listening={listening} />
            </button>
            <button
              className={`add-btn ${adding ? 'loading' : ''}`}
              onClick={handleAdd}
              disabled={adding || !input.trim()}
              title="Добавить (Enter)"
            >
              {adding ? <SpinIcon /> : <PlusIcon />}
            </button>
          </div>
          {addError && <p className="add-error">{addError}</p>}
        </div>

        {/* ── filters ── */}
        <div className="filters">
          <div className="filter-group">
            {(['all', 'false', 'true'] as FilterDone[]).map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'все' : f === 'false' ? 'активные' : 'готово'}
              </button>
            ))}
          </div>

          <div className="filter-group">
            <select
              className="sort-select"
              value={sort}
              onChange={e => setSort(e.target.value as SortField)}
            >
              <option value="">без сортировки</option>
              <option value="create_date">по дате</option>
            </select>
          </div>

          <div className="filter-group date-range">
            <input
              type="date"
              className="date-input"
              value={from}
              onChange={e => setFrom(e.target.value)}
              title="С даты"
            />
            <span className="date-sep">—</span>
            <input
              type="date"
              className="date-input"
              value={to}
              onChange={e => setTo(e.target.value)}
              title="По дату"
            />
            {(from || to) && (
              <button
                className="clear-date"
                onClick={() => { setFrom(''); setTo('') }}
                title="Сбросить даты"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* ── error bar ── */}
        {error && (
          <div className="error-bar">
            <span>⚠ {error}</span>
            <button onClick={() => { setError(null); load() }}>↻ retry</button>
          </div>
        )}

        {/* ── list ── */}
        <div className="todo-list">
          {loading ? (
            <div className="skeleton-wrap">
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton" style={{ opacity: 1 - i * 0.2 }} />
              ))}
            </div>
          ) : todos.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">◎</span>
              <span>пусто</span>
            </div>
          ) : (
            todos.map((todo, i) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                index={i}
                isDeleting={deletingId === todo.id}
                isEditing={editId === todo.id}
                editVal={editVal}
                onToggle={() => handleToggle(todo)}
                onDelete={() => handleDelete(todo.id)}
                onStartEdit={() => startEdit(todo)}
                onEditChange={setEditVal}
                onEditCommit={() => commitEdit(todo.id)}
                onEditCancel={cancelEdit}
              />
            ))
          )}
        </div>
      </main>
    </div>
  )
}

// ─── TodoRow ──────────────────────────────────────────────────────────────────

interface RowProps {
  todo:          Task
  index:         number
  isDeleting:    boolean
  isEditing:     boolean
  editVal:       string
  onToggle:      () => void
  onDelete:      () => void
  onStartEdit:   () => void
  onEditChange:  (v: string) => void
  onEditCommit:  () => void
  onEditCancel:  () => void
}

function TodoRow({
  todo, index, isDeleting, isEditing, editVal,
  onToggle, onDelete, onStartEdit, onEditChange, onEditCommit, onEditCancel,
}: RowProps) {
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) editRef.current?.focus()
  }, [isEditing])

  return (
    <div
      className={`todo-row ${todo.done ? 'done' : ''} ${isDeleting ? 'deleting' : ''}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <button
        className="check-btn"
        onClick={onToggle}
        title={todo.done ? 'Отметить активным' : 'Отметить выполненным'}
      >
        <span className="check-box">
          {todo.done ? <CheckIcon /> : null}
        </span>
      </button>

      <div className="todo-content">
        {isEditing ? (
          <input
            ref={editRef}
            className="edit-input"
            value={editVal}
            onChange={e => onEditChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  onEditCommit()
              if (e.key === 'Escape') onEditCancel()
            }}
            onBlur={onEditCommit}
          />
        ) : (
          <span
            className="todo-title"
            onDoubleClick={onStartEdit}
            title="Двойной клик — редактировать"
          >
            {todo.title}
          </span>
        )}
        {todo.created_at && (
          <span className="todo-date">{formatDate(todo.created_at)}</span>
        )}
      </div>

      <button className="del-btn" onClick={onDelete} title="Удалить">
        <TrashIcon />
      </button>
    </div>
  )
}

// ─── icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SpinIcon() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2"
        strokeDasharray="20 17" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M4 3.5l.5 8h5l.5-8"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MicIcon({ listening }: { listening: boolean }) {
  return listening ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="4" width="8" height="8" rx="2" fill="currentColor" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 8.5c0 2.76 2.24 5 5 5s5-2.24 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="13.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}