import { Navigate } from 'react-router-dom'

/** Экран «Сегодня» появится на Этапе 4; пока ведёт на «Списки». */
export function TodayScreen() {
  return <Navigate to="/lists" replace />
}
