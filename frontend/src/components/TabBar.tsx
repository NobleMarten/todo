import { Link } from 'react-router-dom'
import { LinesIcon, TargetIcon, WeekIcon } from './icons'

// «итоги» появятся вместе с ArchiveScreen (Этап 4): пустой пункт меню не рисуем.
const TABS = [
  { to: '/today', label: 'сегодня', icon: <TargetIcon size={20} />, match: (p: string) => p === '/today' },
  { to: '/lists/week', label: 'неделя', icon: <WeekIcon size={20} />, match: (p: string) => p === '/lists/week' },
  {
    to: '/lists',
    label: 'списки',
    icon: <LinesIcon size={20} />,
    match: (p: string) => p.startsWith('/lists') && p !== '/lists/week',
  },
]

/** Экраны, где таб-бара нет: внутри списка снизу живёт поле быстрого ввода (макет B2). */
export function hidesTabBar(pathname: string): boolean {
  return /^\/lists\/[^/]+$/.test(pathname) && pathname !== '/lists/week'
}

/** pathname — экран под открытой карточкой задачи, а не сам /task/:id. */
export function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav className="tabbar" aria-label="разделы">
      {TABS.map((t) => {
        const active = t.match(pathname)
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`tab ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {t.icon}
            <span className="tab-label">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
