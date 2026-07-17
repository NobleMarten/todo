import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DayCounts } from '../hooks/useActivity'
import { dateKey, pluralTasks } from '../lib/format'
import { SpinIcon } from './icons'

interface Props {
  counts: DayCounts
  loading: boolean
  error: string | null
  onReload: () => void
}

// One column per week. cell + gap = column stride; weekday labels sit in a fixed gutter.
const CELL = 12
const GAP = 3
const COL = CELL + GAP
const GUTTER = 24
const MIN_WEEKS = 6
const MAX_WEEKS = 53

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** GitHub-style intensity: 0 empty · 1–2 · 3–4 · 5+. */
function levelOf(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  return 3
}

/** Tooltip / a11y text for a day, e.g. "9 задач выполнено · 15 июля". */
function cellLabel(count: number, date: Date): string {
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return count === 0 ? `Нет задач · ${day}` : `${pluralTasks(count)} выполнено · ${day}`
}

interface Cell {
  key: string
  date: Date
  count: number
  future: boolean
}
interface Column {
  start: Date
  cells: Cell[]
}

/** Track the grid's rendered width so the number of week-columns adapts to the screen. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export function Activity({ counts, loading, error, onReload }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null)

  const weeks = useMemo(() => {
    // before the ResizeObserver reports, estimate from the viewport so the first paint
    // never overflows the page (a 0-width fallback to MAX_WEEKS would bleed off-screen)
    const usable =
      width > 0 ? width : typeof window !== 'undefined' ? Math.min(window.innerWidth - 64, 568) : 320
    const fit = Math.floor((usable - GUTTER) / COL)
    return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, fit))
  }, [width])

  // Build the week-columns ending on the current week (Mon-first), oldest column first.
  const columns = useMemo<Column[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = (today.getDay() + 6) % 7 // 0 = Mon … 6 = Sun
    const firstMonday = new Date(today)
    firstMonday.setDate(today.getDate() - dow - (weeks - 1) * 7)

    const cols: Column[] = []
    for (let c = 0; c < weeks; c++) {
      const start = new Date(firstMonday)
      start.setDate(firstMonday.getDate() + c * 7)
      const cells: Cell[] = []
      for (let r = 0; r < 7; r++) {
        const date = new Date(start)
        date.setDate(start.getDate() + r)
        const future = date > today
        const key = dateKey(date)
        cells.push({ key, date, count: future ? 0 : (counts.get(key) ?? 0), future })
      }
      cols.push({ start, cells })
    }
    return cols
  }, [counts, weeks])

  // Month label shown on the first column that opens a new month.
  const monthLabels = useMemo(() => {
    let prev = -1
    return columns.map((col) => {
      const m = col.start.getMonth()
      if (m !== prev) {
        prev = m
        return MONTHS_SHORT[m]
      }
      return ''
    })
  }, [columns])

  const stats = useMemo(() => {
    let total = 0
    let best = 0
    for (const n of counts.values()) {
      total += n
      if (n > best) best = n
    }

    // current streak: consecutive days with activity ending today
    let streak = 0
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    while ((counts.get(dateKey(d)) ?? 0) > 0) {
      streak++
      d.setDate(d.getDate() - 1)
    }

    // longest streak ever: walk active days in date order (UTC midnights → exact day gaps)
    const DAY = 86_400_000
    const active = [...counts.entries()]
      .filter(([, n]) => n > 0)
      .map(([k]) => new Date(`${k}T00:00:00Z`).getTime())
      .sort((a, b) => a - b)
    let maxStreak = 0
    let run = 0
    let prevTs = 0
    for (const ts of active) {
      run = prevTs && ts - prevTs === DAY ? run + 1 : 1
      if (run > maxStreak) maxStreak = run
      prevTs = ts
    }

    return { total, best, streak, maxStreak }
  }, [counts])

  return (
    <section className="activity" aria-label="Активность по дням">
      {loading ? (
        <div className="activity-loading">
          <SpinIcon />
        </div>
      ) : error ? (
        <div className="error-bar" role="alert">
          <span>⚠ {error}</span>
          <button onClick={onReload}>↻ retry</button>
        </div>
      ) : stats.total === 0 ? (
        <div className="empty">
          <span className="empty-icon">◫</span>
          <span className="empty-title">пока нет активности</span>
          <span className="empty-hint">выполни первую задачу — здесь появится квадратик</span>
        </div>
      ) : (
        <>
          <div className="cal-stats">
            <div className="cal-stat">
              <span className="cal-stat-num">{stats.total}</span>
              <span className="cal-stat-label">всего выполнено</span>
            </div>
            <div className="cal-stat">
              <span className="cal-stat-num accent">{stats.streak}</span>
              <span className="cal-stat-label">серия, дней</span>
            </div>
            <div className="cal-stat">
              <span className="cal-stat-num">{stats.maxStreak}</span>
              <span className="cal-stat-label">макс. серия, дней</span>
            </div>
            <div className="cal-stat">
              <span className="cal-stat-num">{stats.best}</span>
              <span className="cal-stat-label">рекорд за день</span>
            </div>
          </div>

          <div className="cal" ref={wrapRef}>
            <div className="cal-months" style={{ paddingLeft: GUTTER }}>
              {monthLabels.map((label, i) => (
                <span key={i} className="cal-month" style={{ width: COL }}>
                  {label}
                </span>
              ))}
            </div>

            <div className="cal-body">
              <div className="cal-weekdays" style={{ width: GUTTER }}>
                {WEEKDAYS.map((w, i) => (
                  <span key={w} className="cal-weekday" style={{ height: CELL }}>
                    {i % 2 === 0 ? w : ''}
                  </span>
                ))}
              </div>

              <div className="cal-grid" role="grid">
                {columns.map((col, ci) => (
                  <div key={ci} className="cal-col" role="row">
                    {col.cells.map((cell) =>
                      cell.future ? (
                        <span key={cell.key} className="cal-cell cal-void" aria-hidden="true" />
                      ) : (
                        <span
                          key={cell.key}
                          className="cal-cell"
                          data-level={levelOf(cell.count)}
                          role="gridcell"
                          aria-label={cellLabel(cell.count, cell.date)}
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect()
                            const left = Math.min(
                              Math.max(r.left + r.width / 2, 72),
                              window.innerWidth - 72,
                            )
                            setTip({ left, top: r.top, text: cellLabel(cell.count, cell.date) })
                          }}
                          onMouseLeave={() => setTip(null)}
                        />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="cal-legend">
              <span>меньше</span>
              <span className="cal-cell" data-level={0} />
              <span className="cal-cell" data-level={1} />
              <span className="cal-cell" data-level={2} />
              <span className="cal-cell" data-level={3} />
              <span>больше</span>
            </div>
          </div>

          {tip && (
            <div className="cal-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>
              {tip.text}
            </div>
          )}
        </>
      )}
    </section>
  )
}
