import { Link } from 'react-router-dom'
import { ListIcon, SunriseIcon, WeekIcon } from './icons'

// «итоги» появятся вместе с ArchiveScreen (Этап 4): пустой пункт меню не рисуем.
const TABS = [
  { to: '/today', label: 'сегодня', icon: <SunriseIcon />, match: (p: string) => p === '/today' },
  { to: '/lists/week', label: 'неделя', icon: <WeekIcon />, match: (p: string) => p === '/lists/week' },
  {
    to: '/lists',
    label: 'списки',
    icon: <ListIcon />,
    match: (p: string) => p.startsWith('/lists') && p !== '/lists/week',
  },
]

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
