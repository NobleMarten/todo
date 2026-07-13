import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from './api'
import { useTodos, applyManualOrder, type SectionKey } from './hooks/useTodos'
import { useTheme } from './hooks/useTheme'
import { isDailyTask, isToday, sortTasks } from './lib/format'
import { AddForm } from './components/AddForm'
import { Filters } from './components/Filters'
import { ActiveList, type RowHandlers } from './components/lists'
import { MoonIcon, SunIcon } from './components/icons'
import './index.css'

// non-draggable lists never fire onReorder; keep a stable no-op for the prop
const noop = () => {}

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

  // ── derive sections / completed lists ───────────────────────────────────────
  // Active tasks split into «на сегодня» (daily) and «задачи» (rest). Each section
  // keeps its own order: manual (per-section localStorage) when sort==='', else sorted.
  const { todaySection, restSection, doneTop, doneOnly } = useMemo(() => {
    const doneOnly = t.filter === 'true'
    const active = t.todos.filter((x) => !x.done)
    let done = t.todos.filter((x) => x.done)
    // "активные" view keeps only tasks completed today, to show daily progress
    if (t.filter === 'false') done = done.filter((x) => isToday(x.done_at))
    // completed shown on top, most recently finished first
    done = [...done].sort(
      (a, b) => new Date(b.done_at ?? 0).getTime() - new Date(a.done_at ?? 0).getTime(),
    )

    const orderSection = (tasks: Task[], key: SectionKey) =>
      t.sort ? sortTasks(tasks, t.sort) : applyManualOrder(tasks, t.orders[key])

    return {
      todaySection: orderSection(active.filter(isDailyTask), 'today'),
      restSection: orderSection(active.filter((x) => !isDailyTask(x)), 'rest'),
      doneTop: done,
      doneOnly,
    }
  }, [t.todos, t.filter, t.sort, t.orders])

  const activeCount = todaySection.length + restSection.length

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
    onToggleDaily: (todo) => void t.setDaily(todo.id, !isDailyTask(todo)),
  }

  // Reorder within a single section. A manual drag is an explicit hand-order intent,
  // so if a sort is active we drop back to «вручную» and keep the new per-section order.
  const onReorderSection = useCallback(
    (section: SectionKey) => (reordered: Task[]) => {
      t.reorder(
        section,
        reordered.map((x) => x.id),
      )
      if (t.sort) t.setSort('')
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
          <ActiveList tasks={doneTop} draggable={false} onReorder={noop} handlers={handlers} />
        ) : (
          <>
            {doneTop.length > 0 && (
              <section className="done-group">
                <div className="done-label">
                  выполнено{t.filter === 'false' ? ' сегодня' : ''} · {doneTop.length}
                </div>
                <ActiveList tasks={doneTop} draggable={false} onReorder={noop} handlers={handlers} />
              </section>
            )}

            {todaySection.length > 0 && (
              <section className="section-group">
                <div className="section-label section-today">на сегодня · {todaySection.length}</div>
                <ActiveList
                  tasks={todaySection}
                  draggable
                  onReorder={onReorderSection('today')}
                  handlers={handlers}
                />
              </section>
            )}

            {restSection.length > 0 && (
              <section className="section-group">
                {todaySection.length > 0 && (
                  <div className="section-label">задачи · {restSection.length}</div>
                )}
                <ActiveList
                  tasks={restSection}
                  draggable
                  onReorder={onReorderSection('rest')}
                  handlers={handlers}
                />
              </section>
            )}

            {activeCount === 0 && doneTop.length === 0 && (
              <div className="empty">
                <span className="empty-icon">✓</span>
                <span className="empty-title">на сегодня всё</span>
              </div>
            )}
          </>
        )}

        {!doneOnly && activeCount > 1 && (
          <p className="hint-footer">потяни за ⠿, чтобы изменить порядок · двойной клик — правка</p>
        )}
      </main>
    </div>
  )
}
