import { useId, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import type { Priority } from '../api/types'
import { useElementWidth } from '../hooks/useElementWidth'
import { useOutsideDismiss } from '../hooks/useOutsideDismiss'
import { PRIORITIES, PRIORITY_LABEL, pluralTasks } from '../lib/format'
import { axisTicks, bucketTitle, monotonePath, niceMax, peakIndex, percent, type Bucket } from '../lib/stats'

// Графики экрана «Итоги» — свой SVG без библиотек. Одна ось у графика, данные — акцентом, подписи —
// цветами текста. Подсказка: наведение мышью или касание; касание вне графика или повторное — закрывает.

/** Выбранная точка графика: мышь уводит курсор — снимается, касание вне графика — тоже. */
function useSelection(ref: RefObject<HTMLElement | null>) {
  const [sel, setSel] = useState<number | null>(null)
  useOutsideDismiss(ref, sel !== null, () => setSel(null))
  return {
    sel,
    /** касание — переключает (повторное по той же точке закрывает), мышь — просто выбирает */
    pick: (i: number, e: PointerEvent) => setSel((cur) => (e.pointerType !== 'mouse' && cur === i ? null : i)),
    hover: (i: number, e: PointerEvent) => {
      if (e.pointerType === 'mouse') setSel(i)
    },
    leave: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') setSel(null)
    },
  }
}

/** Плашка над точкой графика; left — центр, прижат к краям контейнера. */
function Tip({ left, top, width, children }: { left: number; top: number; width: number; children: ReactNode }) {
  const x = Math.min(Math.max(left, 70), Math.max(70, width - 70))
  return (
    <div className="chart-tip" role="tooltip" style={{ left: x, top }}>
      {children}
    </div>
  )
}

/** Столбик: скругление r сверху и снизу (капсула), низ на базовой линии. */
function pillPath(x: number, w: number, top: number, base: number, r: number): string {
  const h = base - top
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h / 2)
  return (
    `M${x},${base - rr}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}` +
    `V${base - rr}Q${x + w},${base} ${x + w - rr},${base}H${x + rr}Q${x},${base} ${x},${base - rr}Z`
  )
}

// ── выполнено и создано: область с градиентом и линия ─────────────────────────

const TREND_H = 176
const PAD = { l: 24, r: 10, t: 14, b: 24 }

export function TrendChart({ buckets }: { buckets: Bucket[] }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const { sel, pick, hover, leave } = useSelection(ref)
  const gradId = useId()
  const width = measured || 340
  const n = buckets.length
  const max = niceMax(Math.max(0, ...buckets.map((b) => Math.max(b.done, b.created))))
  const base = TREND_H - PAD.b
  const plotW = width - PAD.l - PAD.r
  const step = n > 1 ? plotW / (n - 1) : 0
  const x = (i: number) => (n > 1 ? PAD.l + step * i : PAD.l + plotW / 2)
  const y = (v: number) => PAD.t + (base - PAD.t) * (1 - v / max)

  const done = monotonePath(buckets.map((b, i) => [x(i), y(b.done)]))
  const created = monotonePath(buckets.map((b, i) => [x(i), y(b.created)]))
  const area = n > 1 ? `${done}L${x(n - 1)},${base}L${x(0)},${base}Z` : ''
  const last = n - 1
  const s = sel !== null ? buckets[sel] : null

  const indexAt = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left
    return n > 1 ? Math.min(n - 1, Math.max(0, Math.round(px / step))) : 0
  }

  return (
    <div
      className="chart"
      ref={ref}
    >
      <svg width={width} height={TREND_H} role="img" aria-label="выполнено и создано по дням">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {axisTicks(max).map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'chart-axis' : 'chart-grid'} x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={PAD.l - 8} y={y(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        <g className="chart-plot">
          <path d={area} fill={`url(#${gradId})`} />
          <path className="chart-line created" d={created} />
          <path className="chart-line done" d={done} />
        </g>

        {s && sel !== null && (
          <g>
            <line className="chart-cross" x1={x(sel)} x2={x(sel)} y1={PAD.t} y2={base} />
            <circle className="chart-dot created" cx={x(sel)} cy={y(s.created)} r={4} />
            <circle className="chart-dot done" cx={x(sel)} cy={y(s.done)} r={5} />
          </g>
        )}
        {sel === null && n > 0 && (
          <g className="chart-last">
            <circle className="chart-glow" cx={x(last)} cy={y(buckets[last].done)} r={9} />
            <circle className="chart-dot done" cx={x(last)} cy={y(buckets[last].done)} r={5} />
          </g>
        )}

        {buckets.map((b, i) =>
          b.label ? (
            <text key={b.from} className="chart-tick" x={x(i)} y={TREND_H - 6} textAnchor="middle">
              {b.label}
            </text>
          ) : null,
        )}

        <rect
          className="chart-hit"
          x={PAD.l - step / 2}
          y={0}
          width={plotW + step}
          height={TREND_H}
          onPointerDown={(e) => pick(indexAt(e), e)}
          onPointerMove={(e) => hover(indexAt(e), e)}
          onPointerLeave={leave}
        />
      </svg>

      {s && sel !== null && (
        // сбоку от линии выбора, у верха графика: точки и линии под плашкой остаются видны
        <div
          className={`chart-tip side ${x(sel) > width / 2 ? 'left' : 'right'}`}
          role="tooltip"
          style={{ left: x(sel), top: PAD.t }}
        >
          <b>{bucketTitle(s)}</b>
          <span>
            <i className="key key-done" /> выполнено <em>{s.done}</em>
          </span>
          <span>
            <i className="key key-created" /> создано <em>{s.created}</em>
          </span>
        </div>
      )}

      <table className="sr-only">
        <thead>
          <tr>
            <th>дни</th>
            <th>выполнено</th>
            <th>создано</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.from}>
              <td>{bucketTitle(b)}</td>
              <td>{b.done}</td>
              <td>{b.created}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── дни недели: капсулы на подложке ───────────────────────────────────────────

const WEEK_H = 118
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function WeekdayColumns({ values }: { values: number[] }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const { sel, pick, hover, leave } = useSelection(ref)
  const width = measured || 300
  const max = Math.max(1, ...values)
  const band = width / values.length
  const barW = Math.min(26, band - 10)
  const top = 18
  const base = WEEK_H - 20
  const peak = peakIndex(values)

  return (
    <div
      className="chart"
      ref={ref}
    >
      <svg width={width} height={WEEK_H} role="img" aria-label="выполнено по дням недели" onPointerLeave={leave}>
        <g className="chart-plot">
          {values.map((v, i) => {
            const bx = band * i + (band - barW) / 2
            return (
              <g key={i}>
                <path className="chart-track" d={pillPath(bx, barW, top, base, barW / 2)} />
                <path
                  className={`chart-bar ${i === peak || i === sel ? '' : 'soft'}`}
                  d={pillPath(bx, barW, top + (base - top) * (1 - v / max), base, barW / 2)}
                />
              </g>
            )
          })}
        </g>
        {peak >= 0 && (
          <text className="chart-value" x={band * (peak + 0.5)} y={top + (base - top) * (1 - values[peak] / max) - 6} textAnchor="middle">
            {values[peak]}
          </text>
        )}
        {WEEKDAYS.map((w, i) => (
          <text key={w} className={`chart-tick ${i === peak ? 'strong' : ''}`} x={band * (i + 0.5)} y={WEEK_H - 4} textAnchor="middle">
            {w}
          </text>
        ))}
        {values.map((_, i) => (
          <rect
            key={i}
            className="chart-hit"
            x={band * i}
            y={0}
            width={band}
            height={WEEK_H}
            onPointerDown={(e) => pick(i, e)}
            onPointerEnter={(e) => hover(i, e)}
          />
        ))}
      </svg>
      {sel !== null && (
        <Tip left={band * (sel + 0.5)} top={top - 4} width={width}>
          <b>{WEEKDAYS[sel]}</b>
          <span>{pluralTasks(values[sel])}</span>
        </Tip>
      )}
    </div>
  )
}

// ── часы: тепловая полоса из 24 клеток ────────────────────────────────────────

export function HourStrip({ values }: { values: number[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const { sel, pick, hover, leave } = useSelection(ref)
  const max = Math.max(1, ...values)
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)))

  return (
    <div className="hour-strip" ref={ref} onPointerLeave={leave}>
      <div className="hour-cells" role="img" aria-label="выполнено по часам">
        {values.map((v, h) => (
          <span
            key={h}
            className={`hour-cell ${sel === h ? 'selected' : ''}`}
            data-level={level(v)}
            onPointerDown={(e) => pick(h, e)}
            onPointerEnter={(e) => hover(h, e)}
          />
        ))}
      </div>
      <div className="hour-labels" aria-hidden="true">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
      {sel !== null && (
        <div className="chart-tip" role="tooltip" style={{ left: `clamp(70px, ${((sel + 0.5) / 24) * 100}%, calc(100% - 70px))`, top: -8 }}>
          <b>
            {sel}:00–{sel + 1}:00
          </b>
          <span>{pluralTasks(values[sel])}</span>
        </div>
      )}
    </div>
  )
}

// ── кольцо: доля в процентах ──────────────────────────────────────────────────

export function Ring({ value, size = 60 }: { value: number | null; size?: number }) {
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const tone = value === null ? '' : value >= 80 ? 'ok' : value >= 50 ? 'warn' : 'danger'
  return (
    <svg className={`ring ${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      {value !== null && value > 0 && (
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  )
}

// ── приоритеты: полоса из частей и легенда с долями ───────────────────────────

export function PrioBar({ counts }: { counts: Record<Priority, number> }) {
  const total = PRIORITIES.reduce((n, p) => n + counts[p], 0)
  if (total === 0) return null
  return (
    <div className="prio">
      <div className="prio-bar" role="img" aria-label={PRIORITIES.map((p) => `${PRIORITY_LABEL[p]} ${counts[p]}`).join(', ')}>
        {PRIORITIES.filter((p) => counts[p] > 0).map((p) => (
          <span key={p} className={`prio-seg prio-${p}`} style={{ flexGrow: counts[p] }} />
        ))}
      </div>
      <div className="prio-legend">
        {PRIORITIES.map((p) => (
          <div key={p} className="prio-item">
            <span className="prio-name">
              <i className={`key key-dot prio-${p}`} /> {PRIORITY_LABEL[p]}
            </span>
            <span className="prio-num">{counts[p]}</span>
            <span className="prio-share">{percent(counts[p], total)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── списки: строки с полосой ──────────────────────────────────────────────────

export interface ListBar {
  key: string
  name: string
  color: string | null // null — «входящие» и «другие»: нейтральная полоса
  value: number
}

export function ListBars({ rows }: { rows: ListBar[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const total = rows.reduce((n, r) => n + r.value, 0)
  return (
    <div className="list-bars">
      {rows.map((r) => (
        <div key={r.key} className="list-bar">
          <div className="list-bar-head">
            <span className={`dot ${r.color ? '' : 'dot-hollow'}`} style={r.color ? { background: r.color } : undefined} />
            <span className="list-bar-title">{r.name}</span>
            <span className="list-bar-value">{r.value}</span>
            <span className="list-bar-share">{percent(r.value, total)}%</span>
          </div>
          <span className="list-bar-track">
            <span
              className="list-bar-fill"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? 'var(--faint)' }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}
