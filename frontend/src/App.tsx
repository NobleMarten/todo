import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from './api'
import { useTodos, applyManualOrder, type Orders } from './hooks/useTodos'
import { useTheme } from './hooks/useTheme'
import { useActivity } from './hooks/useActivity'
import { isToday, sectionOf, SECTIONS, type Section } from './lib/format'
import { AddForm } from './components/AddForm'
import { Filters } from './components/Filters'
import { Activity } from './components/Activity'
import { ActiveList, SectionsBoard, type RowHandlers, type BoardSection } from './components/lists'
import { ActivityIcon, ListIcon, MoonIcon, SunIcon } from './components/icons'
import './index.css'

export default function App() {
  const t = useTodos()
  const { theme, toggle: toggleTheme } = useTheme()

  const [view, setView] = useState<'list' | 'activity'>('list')
  const activity = useActivity(view === 'activity')

  const [editId, setEditId] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // clear needs a double confirm: 0 = idle, 1 = "точно?", 2 = "точно-точно?"
  const [clearStep, setClearStep] = useState(0)

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

  // ── derive priority sections + completed list ───────────────────────────────
  const { sections, doneTop, doneOnly, activeCount } = useMemo(() => {
    const doneOnly = t.filter === 'true'
    const active = t.todos.filter((x) => !x.done)
    let done = t.todos.filter((x) => x.done)
    // "активные" view keeps only tasks completed today, to show daily progress
    if (t.filter === 'false') done = done.filter((x) => isToday(x.done_at))
    // completed shown on top, most recently finished first
    done = [...done].sort(
      (a, b) => new Date(b.done_at ?? 0).getTime() - new Date(a.done_at ?? 0).getTime(),
    )

    const grouped: Record<Section, Task[]> = { daily: [], high: [], medium: [], low: [] }
    for (const task of active) grouped[sectionOf(task)].push(task)

    const sections: BoardSection[] = SECTIONS.map((s) => ({
      key: s.key,
      label: s.label,
      tasks: applyManualOrder(grouped[s.key], t.orders[s.key]),
    }))

    return { sections, doneTop: done, doneOnly, activeCount: active.length }
  }, [t.todos, t.filter, t.orders])

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
    onToggleDaily: (todo) => void t.setDaily(todo.id, sectionOf(todo) !== 'daily'),
  }

  // Commit a drag: rebuild per-section orders from the dropped key sequence, then move
  // any task that ended up under a different section header to that section.
  const handleCommit = useCallback(
    (keys: string[]) => {
      const newOrders: Orders = { daily: [], high: [], medium: [], low: [] }
      let cur: Section = 'daily'
      for (const key of keys) {
        if (key[0] === 'h') {
          cur = key.slice(2) as Section
          continue
        }
        newOrders[cur].push(Number(key.slice(2)))
      }

      const moves: { id: number; to: Section }[] = []
      ;(Object.keys(newOrders) as Section[]).forEach((sec) => {
        for (const id of newOrders[sec]) {
          const task = t.todos.find((x) => x.id === id)
          if (task && sectionOf(task) !== sec) moves.push({ id, to: sec })
        }
      })

      t.reorderAll(newOrders)
      for (const m of moves) void t.moveToSection(m.id, m.to)
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
              className={`icon-btn ${view === 'activity' ? 'active' : ''}`}
              onClick={() => setView((v) => (v === 'activity' ? 'list' : 'activity'))}
              aria-label={view === 'activity' ? 'К списку задач' : 'Активность по дням'}
              aria-pressed={view === 'activity'}
              title={view === 'activity' ? 'К списку задач' : 'Активность'}
            >
              {view === 'activity' ? <ListIcon /> : <ActivityIcon />}
            </button>

            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            {view === 'list' && t.todos.length > 0 && clearStep === 0 && (
              <button className="clear-btn" onClick={() => setClearStep(1)}>
                очистить
              </button>
            )}
            {view === 'list' && clearStep > 0 && (
              <div className="clear-confirm">
                <span>{clearStep === 1 ? 'точно?' : 'точно-точно?'}</span>
                <button
                  className="confirm-yes"
                  onClick={() => {
                    if (clearStep === 1) {
                      setClearStep(2)
                    } else {
                      setClearStep(0)
                      void t.clear()
                    }
                  }}
                >
                  да
                </button>
                <button className="confirm-no" onClick={() => setClearStep(0)}>
                  нет
                </button>
              </div>
            )}
          </div>
        </header>

        {view === 'activity' ? (
          <Activity
            counts={activity.counts}
            loading={activity.loading}
            error={activity.error}
            onReload={activity.reload}
          />
        ) : (
          <>
        <AddForm inputRef={inputRef} onAdd={t.add} />

        <Filters
          filter={t.filter}
          setFilter={t.setFilter}
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
          <ActiveList tasks={doneTop} handlers={handlers} />
        ) : (
          <>
            {doneTop.length > 0 && (
              <section className="done-group">
                <div className="done-label">
                  выполнено{t.filter === 'false' ? ' сегодня' : ''} · {doneTop.length}
                </div>
                <ActiveList tasks={doneTop} handlers={handlers} />
              </section>
            )}

            {activeCount > 0 ? (
              <SectionsBoard sections={sections} onCommit={handleCommit} handlers={handlers} />
            ) : doneTop.length === 0 ? (
              <div className="empty">
                <span className="empty-icon">✓</span>
                <span className="empty-title">на сегодня всё</span>
              </div>
            ) : null}
          </>
        )}

        {!doneOnly && activeCount > 1 && (
          <p className="hint-footer">
            потяни за ⠿: вверх/вниз — порядок, через границу — приоритет · двойной клик — правка
          </p>
        )}
          </>
        )}
      </main>
    </div>
  )
}
