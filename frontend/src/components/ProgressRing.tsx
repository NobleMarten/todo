import type { ReactNode } from 'react'

interface Props {
  value: number // 0…1
  size?: number
  stroke?: number
  done?: boolean // всё сделано: кольцо зелёное
  label: string // для скринридера: «2 из 6»
  children?: ReactNode // в центре кольца
}

/** Кольцо прогресса: дорожка и заливка по часовой от 12 часов; заливка доезжает плавно. */
export function ProgressRing({ value, size = 56, stroke = 5, done = false, label, children }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.min(1, Math.max(0, value))
  return (
    <div className={`progress-ring ${done ? 'done' : ''}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="progress-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={v > 0 ? 1 : 0}
        />
      </svg>
      <span className="progress-ring-center" aria-hidden="true">
        {children}
      </span>
    </div>
  )
}
