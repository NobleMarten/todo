import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon } from './icons'

interface Props {
  title: ReactNode
  aside?: ReactNode // рядом с заголовком по базовой линии («24 активных»)
  back?: string // куда ведёт «назад»; с ним шапка компактная (макет B2)
  right?: ReactNode
  children?: ReactNode // под строкой заголовка: прогресс, чипы
}

export function ScreenHeader({ title, aside, back, right, children }: Props) {
  const navigate = useNavigate()

  return (
    <header className={`screen-header ${back ? 'compact' : ''}`}>
      <div className="screen-header-row">
        {back && (
          <button className="box-btn" onClick={() => navigate(back)} aria-label="назад">
            <span className="box">
              <BackIcon />
            </span>
          </button>
        )}
        <div className="screen-heading">
          <h1 className="screen-title">{title}</h1>
          {aside && <span className="screen-aside">{aside}</span>}
        </div>
        {right}
      </div>
      {children}
    </header>
  )
}

/** Логотип [todo] — характер приложения (раздел 5), в макетах его нет. */
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-bracket">[</span>
      <span className="logo-text">todo</span>
      <span className="logo-bracket">]</span>
    </span>
  )
}
