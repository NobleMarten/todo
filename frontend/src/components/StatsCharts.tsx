import { useState, type PointerEvent, type ReactNode } from 'react'
import type { Priority } from '../api/types'
import { useElementWidth } from '../hooks/useElementWidth'
import { PRIORITIES, PRIORITY_LABEL } from '../lib/format'
import { bucketTitle, niceMax, peakIndex, type Bucket } from '../lib/stats'

// Графики экрана «Итоги» — свой SVG без библиотек. Одна ось у каждого графика, тонкие столбики
// со скруглённым верхом от общей базовой линии, подписи — цветами текста, подсказка при наведении
// (на телефоне — по касанию, держится до следующего касания).

/** Столбик со скруглённым верхом r и прямым низом на базовой линии. */
function barPath(x: number, w: number, top: number, base: number, r: number): string {
  const h = base - top
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${base}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${base}Z`
}

/** Подсказка над точкой графика; left — центр, прижат к краям контейнера. */
function Tip({ left, top, width, children }: { left: number; top: number; width: number; children: ReactNode }) {
  const x = Math.min(Math.max(left, 64), Math.max(64, width - 64))
  return (
    <div className="chart-tip" role="tooltip" style={{ left: x, top }}>
      {children}
    </div>
  )
}

/** Наведение мышью уходит вместе с курсором, касание — остаётся до следующего касания. */
function leaveIfMouse(e: PointerEvent, clear: () => void) {
  if (e.pointerType === 'mouse') clear()
}

// ── выполнено и создано ───────────────────────────────────────────────────────

const TREND_H = 150
const PAD = { l: 26, r: 4, t: 10, b: 20 }

export function TrendChart({ buckets }: { buckets: Bucket[] }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const width = measured || 340
  const n = buckets.length
  const max = niceMax(Math.max(0, ...buckets.map((b) => Math.max(b.done, b.created))))
  const band = (width - PAD.l - PAD.r) / n
  const barW = Math.max(2, Math.min(24, band - 2)) // зазор не меньше 2 px, толщина не больше 24
  const base = TREND_H - PAD.b
  const y = (v: number) => PAD.t + (base - PAD.t) * (1 - v / max)
  const cx = (i: number) => PAD.l + band * (i + 0.5)
  const line = buckets.map((b, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(b.created).toFixed(1)}`).join('')
  const h = hover !== null ? buckets[hover] : null

  return (
    <div className="chart" ref={ref}>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="key key-bar" /> выполнено
        </span>
        <span>
          <i className="key key-line" /> создано
        </span>
      </div>
      <svg
        width={width}
        height={TREND_H}
        role="img"
        aria-label="выполнено и создано по дням"
        onPointerLeave={(e) => leaveIfMouse(e, () => setHover(null))}
      >
        <line className="chart-grid" x1={PAD.l} x2={width - PAD.r} y1={y(max)} y2={y(max)} />
        <line className="chart-axis" x1={PAD.l} x2={width - PAD.r} y1={base} y2={base} />
        <text className="chart-tick" x={PAD.l - 6} y={y(max) + 3} textAnchor="end">
          {max}
        </text>
        <text className="chart-tick" x={PAD.l - 6} y={base + 3} textAnchor="end">
          0
        </text>

        {hover !== null && (
          <rect className="chart-hover" x={PAD.l + band * hover} y={PAD.t} width={band} height={base - PAD.t} rx={3} />
        )}
        {buckets.map((b, i) => (
          <path key={b.from} className="chart-bar" d={barPath(cx(i) - barW / 2, barW, y(b.done), base, 4)} />
        ))}
        <path className="chart-line" d={line} />
        {h && hover !== null && <circle className="chart-dot" cx={cx(hover)} cy={y(h.created)} r={4} />}

        {buckets.map((b, i) =>
          b.label ? (
            <text key={b.from} className="chart-tick" x={cx(i)} y={TREND_H - 5} textAnchor="middle">
              {b.label}
            </text>
          ) : null,
        )}
        {buckets.map((b, i) => (
          <rect
            key={b.from}
            className="chart-hit"
            x={PAD.l + band * i}
            y={0}
            width={band}
            height={TREND_H}
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
          />
        ))}
      </svg>
      {h && hover !== null && (
        <Tip left={cx(hover)} top={PAD.t + 26} width={width}>
          <b>{bucketTitle(h)}</b>
          <span>выполнено {h.done}</span>
          <span>создано {h.created}</span>
        </Tip>
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

// ── небольшие колонки: дни недели, часы ───────────────────────────────────────

const MINI_H = 72

interface MiniProps {
  values: number[]
  /** подпись под колонкой; '' — без подписи */
  labels: string[]
  /** текст подсказки для колонки */
  tip: (i: number) => string
  label: string
}

/** Колонки одного ряда; самая высокая — акцентом, остальные — приглушённым тем же цветом. */
export function MiniColumns({ values, labels, tip, label }: MiniProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const width = measured || 160
  const max = Math.max(1, ...values)
  const band = width / values.length
  const barW = Math.max(2, Math.min(24, band - 2))
  const base = MINI_H - 16
  const peak = peakIndex(values)

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={MINI_H}
        role="img"
        aria-label={label}
        onPointerLeave={(e) => leaveIfMouse(e, () => setHover(null))}
      >
        <line className="chart-axis" x1={0} x2={width} y1={base} y2={base} />
        {values.map((v, i) => (
          <path
            key={i}
            className={`chart-bar ${i === peak ? '' : 'soft'}`}
            d={barPath(band * i + (band - barW) / 2, barW, 4 + (base - 4) * (1 - v / max), base, 3)}
          />
        ))}
        {labels.map((l, i) =>
          l ? (
            <text key={i} className="chart-tick" x={band * (i + 0.5)} y={MINI_H - 3} textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {values.map((_, i) => (
          <rect
            key={i}
            className="chart-hit"
            x={band * i}
            y={0}
            width={band}
            height={MINI_H}
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
          />
        ))}
      </svg>
      {hover !== null && (
        <Tip left={band * (hover + 0.5)} top={0} width={width}>
          {tip(hover)}
        </Tip>
      )}
    </div>
  )
}

// ── приоритеты: одна полоса из трёх частей ────────────────────────────────────

export function PrioBar({ counts }: { counts: Record<Priority, number> }) {
  const total = PRIORITIES.reduce((n, p) => n + counts[p], 0)
  if (total === 0) return null
  return (
    <div className="prio-bar-wrap">
      <div className="prio-bar" role="img" aria-label={PRIORITIES.map((p) => `${PRIORITY_LABEL[p]} ${counts[p]}`).join(', ')}>
        {PRIORITIES.filter((p) => counts[p] > 0).map((p) => (
          <span key={p} className={`prio-seg prio-${p}`} style={{ flexGrow: counts[p] }} />
        ))}
      </div>
      <div className="chart-legend">
        {PRIORITIES.map((p) => (
          <span key={p}>
            <i className={`key key-dot prio-${p}`} /> {PRIORITY_LABEL[p]} <b>{counts[p]}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── списки: горизонтальные полосы ─────────────────────────────────────────────

export interface ListBar {
  key: string
  name: string
  color: string | null // null — «входящие», полоса нейтральная
  value: number
}

export function ListBars({ rows }: { rows: ListBar[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="list-bars">
      {rows.map((r) => (
        <div key={r.key} className="list-bar">
          <span className="list-bar-name">
            <span className={`dot ${r.color ? '' : 'dot-hollow'}`} style={r.color ? { background: r.color } : undefined} />
            <span className="list-bar-title">{r.name}</span>
          </span>
          <span className="list-bar-track">
            <span
              className="list-bar-fill"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? 'var(--faint)' }}
            />
          </span>
          <span className="list-bar-value mono-num">{r.value}</span>
        </div>
      ))}
    </div>
  )
}
