import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon } from './icons'

interface Props {
  title?: ReactNode // без заголовка — логотип [todo]
  subtitle?: ReactNode
  back?: string // куда ведёт «назад»
  right?: ReactNode
}

export function ScreenHeader({ title, subtitle, back, right }: Props) {
  const navigate = useNavigate()

  return (
    <header className="screen-header">
      <div className="screen-header-row">
        {back && (
          <button className="icon-btn" onClick={() => navigate(back)} aria-label="назад">
            <BackIcon />
          </button>
        )}
        <h1 className="screen-title">
          {title ?? (
            <span className="logo">
              <span className="logo-bracket">[</span>
              <span className="logo-text">todo</span>
              <span className="logo-bracket">]</span>
            </span>
          )}
        </h1>
        {right && <div className="screen-header-right">{right}</div>}
      </div>
      {subtitle && <div className="screen-subtitle">{subtitle}</div>}
    </header>
  )
}
