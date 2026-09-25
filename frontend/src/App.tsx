import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, type Location } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { TaskSheet } from './components/TaskSheet'
import { UndoToast } from './components/UndoToast'
import { useAuth } from './hooks/useAuth'
import { useTheme, type Theme } from './hooks/useTheme'
import { hidesTabBar } from './lib/nav'
import { ArchiveScreen } from './screens/ArchiveScreen'
import { ListsScreen } from './screens/ListsScreen'
import { LoginScreen } from './screens/LoginScreen'
import { PlanDayScreen } from './screens/PlanDayScreen'
import { ProjectScreen } from './screens/ProjectScreen'
import { TodayScreen } from './screens/TodayScreen'
import { WeekScreen } from './screens/WeekScreen'

const THEME_BG: Record<Theme, string> = { dark: '#0B0B0F', light: '#F6F6F8' }

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

  const background = (location.state as { background?: Location } | null)?.background
  const base = taskMatch ? (background ?? '/today') : location
  const basePath = typeof base === 'string' ? base : base.pathname
  const taskId = taskMatch && /^\d+$/.test(taskMatch.params.id ?? '') ? Number(taskMatch.params.id) : null

  const closeSheet = () => {
    if (background) navigate(-1)
    else navigate('/today', { replace: true })
  }

  // пока не знаем, нужен ли вход, — пустой фон, а не мигание экрана входа
  if (auth.state !== 'in') {
    return (
      <div className="app">
        <div className="grain" aria-hidden="true" />
        <main className="container">{auth.state === 'out' && <LoginScreen onLogin={auth.login} />}</main>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="grain" aria-hidden="true" />
      <main className="container">
        <Routes location={base}>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayScreen />} />
          <Route path="/plan" element={<PlanDayScreen />} />
          <Route path="/week" element={<WeekScreen />} />
          <Route path="/lists" element={<ListsScreen theme={theme} onToggleTheme={toggle} />} />
          <Route path="/lists/:id" element={<ProjectScreen />} />
          <Route path="/archive" element={<ArchiveScreen onLogout={auth.enabled ? auth.logout : undefined} />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
      {!hidesTabBar(basePath) && <TabBar pathname={basePath} />}
      {taskId !== null && <TaskSheet key={taskId} id={taskId} onClose={closeSheet} />}
      <UndoToast />
    </div>
  )
}
