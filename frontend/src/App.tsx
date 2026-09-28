import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, type Location } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { TaskSheet } from './components/TaskSheet'
import { UndoToast } from './components/UndoToast'
import { BackIcon } from './components/icons'
import { useAuth } from './hooks/useAuth'
import { useEdgeBack } from './hooks/useEdgeBack'
import { useScrollRestoration } from './hooks/useScrollRestoration'
import { useTheme, type Theme } from './hooks/useTheme'
import { hidesTabBar, parentOf } from './lib/nav'
import { bindNavigator } from './lib/opener'
import { ListsScreen } from './screens/ListsScreen'
import { LoginScreen } from './screens/LoginScreen'
import { PlanDayScreen } from './screens/PlanDayScreen'
import { ProjectScreen } from './screens/ProjectScreen'
import { TodayScreen } from './screens/TodayScreen'

const THEME_BG: Record<Theme, string> = { dark: '#0B0B0F', light: '#F6F6F8' }

// Редкие экраны — отдельными кусками (−8 КБ gzip из основного бандла): «Неделя», «Итоги» с гридом активности,
// поиск. Чтобы переход на них не ждал сети, куски догружаются в простое после первой отрисовки.
const loadWeek = () => import('./screens/WeekScreen')
const loadArchive = () => import('./screens/ArchiveScreen')
const loadSearch = () => import('./screens/SearchScreen')
const WeekScreen = lazy(() => loadWeek().then((m) => ({ default: m.WeekScreen })))
const ArchiveScreen = lazy(() => loadArchive().then((m) => ({ default: m.ArchiveScreen })))
const SearchScreen = lazy(() => loadSearch().then((m) => ({ default: m.SearchScreen })))

/**
 * Маршруты. /task/:id — шит поверх экрана, с которого его открыли (location.state.background);
 * по прямой ссылке под шитом рисуется «Сегодня».
 */
export default function App() {
  const { theme, toggle } = useTheme()
  const auth = useAuth()

  // цвет статус-бара и панели браузера — под выбранную тему, а не под системную (= --bg из theme.css)
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[theme])
  }, [theme])
  const location = useLocation()
  const navigate = useNavigate()
  const taskMatch = useMatch('/task/:id')
  // строки открывают карточку через lib/opener, не подписываясь на адрес сами
  useLayoutEffect(() => bindNavigator(navigate, location), [navigate, location])

  const background = (location.state as { background?: Location } | null)?.background
  const base = taskMatch ? (background ?? '/today') : location
  const basePath = typeof base === 'string' ? base : base.pathname
  useScrollRestoration(typeof base === 'string' ? base : base.key, basePath)
  const taskId = taskMatch && /^\d+$/.test(taskMatch.params.id ?? '') ? Number(taskMatch.params.id) : null

  useEffect(() => {
    const preload = () => void Promise.all([loadWeek(), loadArchive(), loadSearch()]).catch(() => {})
    // requestIdleCallback в Safari нет
    const t = setTimeout(preload, 1500)
    return () => clearTimeout(t)
  }, [])

  const closeSheet = () => {
    if (background) navigate(-1)
    else navigate('/today', { replace: true })
  }

  // свайп «назад» от края: закрыть карточку или уйти с экрана, у которого в шапке есть «назад»
  const parent = parentOf(basePath)
  const edgeIndicator = useRef<HTMLDivElement>(null)
  useEdgeBack(
    taskId !== null || parent !== null,
    () => {
      if (taskId !== null) closeSheet()
      // есть куда вернуться внутри приложения (react-router хранит номер записи в history.state.idx) — назад,
      // иначе (открыли по ссылке) — туда же, куда ведёт стрелка в шапке
      else if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1)
      else if (parent) navigate(parent, { replace: true })
    },
    edgeIndicator,
  )

  // пока не знаем, нужен ли вход, — пустой фон, а не мигание экрана входа
  if (auth.state !== 'in') {
    return (
      <div className="app">
        <main className="container">{auth.state === 'out' && <LoginScreen onLogin={auth.login} />}</main>
      </div>
    )
  }

  return (
    <div className="app">
      <main className="container">
        {/* кусок экрана ещё не пришёл (прямая ссылка, медленная сеть) — пусто, а не скелетон на миг */}
        <Suspense fallback={null}>
          <Routes location={base}>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayScreen />} />
            <Route path="/plan" element={<PlanDayScreen />} />
            <Route path="/week" element={<WeekScreen />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/lists" element={<ListsScreen theme={theme} onToggleTheme={toggle} />} />
            <Route path="/lists/:id" element={<ProjectScreen />} />
            <Route path="/archive" element={<ArchiveScreen user={auth.user} onLogout={auth.logout} />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!hidesTabBar(basePath) && <TabBar pathname={basePath} />}
      <AnimatePresence>{taskId !== null && <TaskSheet key={taskId} id={taskId} onClose={closeSheet} />}</AnimatePresence>
      <UndoToast />
      <div className="edge-back" ref={edgeIndicator} aria-hidden="true">
        <BackIcon />
      </div>
    </div>
  )
}
