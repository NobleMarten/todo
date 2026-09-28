import { useCallback } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'
import type { Task } from '../api/types'
import { cache } from '../lib/cache'

type SheetState = { background?: Location }

/**
 * Открыть карточку задачи поверх текущего экрана. Экран под шитом запоминается
 * в location.state.background; из одной карточки в другую переходим с replace,
 * чтобы «назад» закрывал шит, а не листал карточки. Задача, которую уже знает строка списка,
 * кладётся в кэш подсказкой — карточка рисуется сразу, без спиннера, подзадачи догружаются в фоне.
 */
export function useOpenTask() {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (id: number, known?: Task) => {
      if (known) cache.prime(`task:${id}`, known)
      const bg = (location.state as SheetState | null)?.background
      navigate(`/task/${id}`, { state: { background: bg ?? location }, replace: Boolean(bg) })
    },
    [navigate, location],
  )
}
