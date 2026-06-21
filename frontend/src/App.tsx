import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from './api'
import { useTodos, applyManualOrder } from './hooks/useTodos'
import { useTheme } from './hooks/useTheme'
import { isToday, sortTasks } from './lib/format'
import { AddForm } from './components/AddForm'
import { Filters } from './components/Filters'
import { ActiveList, CompletedSection, type RowHandlers } from './components/lists'
import { MoonIcon, SunIcon } from './components/icons'
import './index.css'

export default function App() {
  const t = useTodos()
  const { theme, toggle: toggleTheme } = useTheme()

  const [editId, setEditId] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── keyboard shortcuts: "n" / "/" focus the new-task field ──────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      if (typing) return
      if (e.key === 'n' || e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── derive active / completed lists ─────────────────────────────────────────
  const { activeTasks, doneTasks, doneOnly } = useMemo(() => {
    const doneOnly = t.filter === 'true'
    const active = t.todos.filter((x) => !x.done)
    let done = t.todos.filter((x) => x.done)
    // "активные" view keeps only tasks completed today, to show daily progress
    if (t.filter === 'false') done = done.filter((x) => isToday(x.done_at))

    const activeOrdered = t.sort ? sortTasks(active, t.sort) : applyManualOrder(active, t.order)
    return { activeTasks: activeOrdered, doneTasks: done, doneOnly }
  }, [t.todos, t.filter, t.sort, t.order])

  const doneCount = useMemo(() => t.todos.filter((x) => x.done).length, [t.todos])

  // ── row handlers shared by both lists ───────────────────────────────────────
  const handleDelete = useCallback(
    (id: number) => {
      setDeletingId(id)
      setTimeout(() => {
        void t.remove(id).finally(() => setDeletingId(null))
      }, 240)
    },
    [t],
  )

  const commitEdit = useCallback(
    (id: number) => {
      const title = editVal.trim()
      setEditId(null)
      if (title) void t.editTitle(id, title)
    },
    [editVal, t],
  )

  const handlers: RowHandlers = {
    editId,
    editVal,
    deletingId,
    onToggle: t.toggle,
    onDelete: handleDelete,
    onStartEdit: (todo) => {
      setEditId(todo.id)
      setEditVal(todo.title)
    },
    onEditChange: setEditVal,
    onEditCommit: commitEdit,
    onEditCancel: () => setEditId(null),
    onPriorityChange: t.setPriority,
  }

  const onReorder = useCallback(
    (reordered: Task[]) => {
      const activeIds = reordered.map((x) => x.id)
      const rest = t.order.filter((id) => !activeIds.includes(id))
      t.reorder([...activeIds, ...rest])
    },
    [t],
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="grain" />

      <main className="container">
        <header className="header">
          <div className="header-left">
            <span className="logo-bracket">[</span>
            <span className="logo-text">todo</span>
            <span className="logo-bracket">]</span>
          </div>

          <div className="header-right">
            <div className="header-stats">
              <span className="stat">
                <span className="stat-num">{t.total}</span>
                <span className="stat-label"> total</span>
              </span>
              <span className="stat-dot">·</span>
              <span className="stat">
                <span className="stat-num accent">{doneCount}</span>
                <span className="stat-label"> done</span>
              </span>
            </div>

            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            {t.todos.length > 0 && !showClearConfirm && (
              <button className="clear-btn" onClick={() => setShowClearConfirm(true)}>
                очистить
              </button>
            )}
            {showClearConfirm && (
              <div className="clear-confirm">
                <span>точно?</span>
                <button
                  className="confirm-yes"
                  onClick={() => {
                    setShowClearConfirm(false)
                    void t.clear()
                  }}
                >
                  да
                </button>
                <button className="confirm-no" onClick={() => setShowClearConfirm(false)}>
                  нет
                </button>
              </div>
            )}
          </div>
        </header>

        <AddForm inputRef={inputRef} onAdd={t.add} />

        <Filters
          filter={t.filter}
          setFilter={t.setFilter}
          sort={t.sort}
          setSort={t.setSort}
          from={t.from}
          setFrom={t.setFrom}
          to={t.to}
          setTo={t.setTo}
        />

        {t.error && (
          <div className="error-bar" role="alert">
            <span>⚠ {t.error}</span>
            <button
              onClick={() => {
                t.setError(null)
                void t.reload()
              }}
            >
              ↻ retry
            </button>
          </div>
        )}

        {t.loading ? (
          <div className="skeleton-wrap">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : t.todos.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">◎</span>
            <span className="empty-title">пока пусто</span>
            <span className="empty-hint">
              нажми <kbd>n</kbd> и добавь первую задачу
            </span>
          </div>
        ) : doneOnly ? (
          <ActiveList tasks={doneTasks} draggable={false} onReorder={onReorder} handlers={handlers} />
        ) : (
          <>
            {activeTasks.length === 0 && doneTasks.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">✓</span>
                <span className="empty-title">на сегодня всё</span>
              </div>
            ) : (
              <ActiveList
                tasks={activeTasks}
                draggable={t.sort === ''}
                onReorder={onReorder}
                handlers={handlers}
              />
            )}
            <CompletedSection tasks={doneTasks} handlers={handlers} />
          </>
        )}

        {t.sort === '' && !doneOnly && activeTasks.length > 1 && (
          <p className="hint-footer">потяни за ⠿, чтобы изменить порядок · двойной клик — правка</p>
        )}
      </main>
    </div>
  )
}
