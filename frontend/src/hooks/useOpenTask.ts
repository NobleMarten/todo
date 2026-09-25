import { useCallback } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

type SheetState = { background?: Location }

/**
 * Открыть карточку задачи поверх текущего экрана. Экран под шитом запоминается
 * в location.state.background; из одной карточки в другую переходим с replace,
 * чтобы «назад» закрывал шит, а не листал карточки.
 */
export function useOpenTask() {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (id: number) => {
      const bg = (location.state as SheetState | null)?.background
      navigate(`/task/${id}`, { state: { background: bg ?? location }, replace: Boolean(bg) })
    },
    [navigate, location],
  )
}
