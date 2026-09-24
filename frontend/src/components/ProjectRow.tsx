import type { ReactNode } from 'react'
import type { DragControls } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ChevronIcon, GripIcon } from './icons'

interface Props {
  to: string
  name: string
  color: string | null // null — «входящие» (полая точка)
  active?: number
  overdue?: number
  dragControls?: DragControls
  action?: ReactNode // вместо счётчиков (например, «вернуть» у архивного)
}

/** Строка списка на экране «Списки»: точка цвета, имя, красный бейдж просроченных, счётчик активных. */
export function ProjectRow({ to, name, color, active, overdue, dragControls, action }: Props) {
  return (
    <div className="project-row">
      <Link to={to} className="project-link">
        <span className={`dot ${color ? '' : 'dot-hollow'}`} style={color ? { background: color } : undefined} />
        <span className="project-name">{name}</span>
        {!action && (
          <span className="project-counts">
            {overdue ? <span className="badge-danger mono-num">{overdue}</span> : null}
            {active !== undefined && <span className="mono-num muted">{active}</span>}
            <ChevronIcon />
          </span>
        )}
      </Link>
      {action}
      {dragControls && (
        <span
          className="grip"
          onPointerDown={(e) => {
            e.preventDefault()
            dragControls.start(e)
          }}
          aria-hidden="true"
        >
          <GripIcon />
        </span>
      )}
    </div>
  )
}
