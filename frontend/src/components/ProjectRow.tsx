import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronIcon } from './icons'

interface Props {
  to: string
  name: string
  color: string | null // null — «входящие» (полая точка)
  active?: number
  overdue?: number
  action?: ReactNode // вместо счётчиков (например, «вернуть» у архивного)
}

/** Строка списка (макет B1): точка цвета, имя, бейдж просроченных, счётчик активных. */
export function ProjectRow({ to, name, color, active, overdue, action }: Props) {
  return (
    <div className="project-row">
      <Link to={to} className="project-link">
        <span className={`dot ${color ? '' : 'dot-hollow'}`} style={color ? { background: color } : undefined} />
        <span className="project-name">{name}</span>
        {!action && (
          <>
            {overdue ? <span className="badge badge-danger">{overdue}</span> : null}
            {active !== undefined && <span className="mono-num muted">{active}</span>}
            <span className="row-chevron">
              <ChevronIcon />
            </span>
          </>
        )}
      </Link>
      {action}
    </div>
  )
}
