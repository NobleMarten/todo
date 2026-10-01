import type { ReactNode } from 'react'

export type EmptyArt = 'sun' | 'list' | 'search' | 'calendar' | 'chart' | 'done' | 'idea'

interface Props {
  art: EmptyArt
  title?: string
  hint?: ReactNode
  compact?: boolean // внутри экрана между блоками («Неделя»): иллюстрация меньше, отступы скромнее
  children?: ReactNode // действие: кнопка или ссылка
}

/**
 * Пустое состояние: небольшая иллюстрация в цветах темы, заголовок, подсказка и, если есть, действие.
 * Рисунки — свой SVG: линии — акцентом (.ea-line), заливки — мягким акцентом (.ea-soft) и поверхностью (.ea-card).
 */
export function EmptyState({ art, title, hint, compact, children }: Props) {
  return (
    <div className={`empty ${compact ? 'compact' : ''}`}>
      <svg className="empty-art" viewBox="0 0 120 96" aria-hidden="true">
        <Art art={art} />
      </svg>
      {title && <span className="empty-title">{title}</span>}
      {hint && <span className="empty-hint">{hint}</span>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  )
}

function Art({ art }: { art: EmptyArt }) {
  switch (art) {
    case 'sun':
      return (
        <>
          <circle className="ea-soft" cx="60" cy="66" r="30" />
          <circle className="ea-fill" cx="60" cy="66" r="17" />
          {[-64, -32, 0, 32, 64].map((a) => (
            <line key={a} className="ea-line" x1="60" y1="30" x2="60" y2="20" transform={`rotate(${a} 60 66)`} />
          ))}
          <rect className="ea-bg" x="10" y="72" width="100" height="24" />
          <line className="ea-line" x1="14" y1="72" x2="106" y2="72" />
          <line className="ea-line faint" x1="32" y1="82" x2="88" y2="82" />
          <line className="ea-line faint" x1="46" y1="90" x2="74" y2="90" />
        </>
      )
    case 'list':
      return (
        <>
          <rect className="ea-card back" x="30" y="14" width="64" height="70" rx="10" transform="rotate(-6 62 49)" />
          <rect className="ea-card" x="26" y="14" width="64" height="70" rx="10" />
          {[32, 48, 64].map((y, i) => (
            <g key={y}>
              <circle className={i === 0 ? 'ea-fill' : 'ea-ring'} cx="40" cy={y} r="5" />
              <line className={`ea-line ${i === 0 ? 'faint' : ''}`} x1="52" y1={y} x2={i === 2 ? 68 : 78} y2={y} />
            </g>
          ))}
        </>
      )
    case 'search':
      return (
        <>
          <rect className="ea-card" x="18" y="18" width="62" height="62" rx="10" />
          <line className="ea-line faint" x1="30" y1="36" x2="66" y2="36" />
          <line className="ea-line faint" x1="30" y1="48" x2="58" y2="48" />
          <line className="ea-line faint" x1="30" y1="60" x2="62" y2="60" />
          <circle className="ea-soft" cx="74" cy="56" r="17" />
          <circle className="ea-ring thick" cx="74" cy="56" r="17" />
          <line className="ea-line thick" x1="86" y1="68" x2="98" y2="80" />
        </>
      )
    case 'calendar':
      return (
        <>
          <rect className="ea-card" x="26" y="20" width="68" height="64" rx="10" />
          <path className="ea-soft" d="M26 36v-6a10 10 0 0 1 10-10h48a10 10 0 0 1 10 10v6z" />
          <line className="ea-line" x1="44" y1="14" x2="44" y2="26" />
          <line className="ea-line" x1="76" y1="14" x2="76" y2="26" />
          {[0, 1, 2, 3].map((c) =>
            [0, 1].map((r) => (
              <circle
                key={`${c}-${r}`}
                className={c === 2 && r === 0 ? 'ea-fill' : 'ea-dot'}
                cx={40 + c * 13}
                cy={52 + r * 14}
                r="3.5"
              />
            )),
          )}
        </>
      )
    case 'chart':
      return (
        <>
          <line className="ea-line faint" x1="18" y1="82" x2="102" y2="82" />
          {[22, 38, 30, 52, 44, 62].map((h, i) => (
            <rect key={i} className={i === 5 ? 'ea-fill' : 'ea-soft'} x={22 + i * 13} y={80 - h} width="9" height={h} rx="4.5" />
          ))}
          <path className="ea-line" d="M26 52 L39 40 L52 46 L65 28 L78 34 L91 16" />
        </>
      )
    case 'done':
      return (
        <>
          <circle className="ea-soft" cx="60" cy="50" r="30" />
          <circle className="ea-ring thick" cx="60" cy="50" r="22" />
          <path className="ea-line thick" d="M50 50l7 7 13-14" />
          <path className="ea-line spark" d="M96 20v8M92 24h8" />
          <path className="ea-line spark" d="M22 70v6M19 73h6" />
          <circle className="ea-fill" cx="28" cy="26" r="2.5" />
        </>
      )
    case 'idea':
      return (
        <>
          <circle className="ea-soft" cx="60" cy="42" r="26" />
          <path className="ea-ring thick" d="M48 56a18 18 0 1 1 24 0c-2 2-3 4-3 7H51c0-3-1-5-3-7z" />
          <line className="ea-line" x1="52" y1="72" x2="68" y2="72" />
          <line className="ea-line" x1="54" y1="80" x2="66" y2="80" />
          <path className="ea-line spark" d="M98 22l-6 4M100 40h-8M22 22l6 4M20 40h8" />
        </>
      )
  }
}
