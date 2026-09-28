import type { Location, NavigateFunction } from 'react-router-dom'
import type { Task } from '../api/types'
import { cache } from './cache'

// Открыть карточку задачи, не подписывая строку списка на смену адреса. Хук с useLocation/useNavigate
// в каждой строке перерисовывал все строки при каждом открытии и закрытии шита — ровно во время его
// анимации (useNavigate в react-router тоже подписан на location). App кладёт сюда актуальные
// navigate и location, строка читает их в момент нажатия.

type SheetState = { background?: Location }

let current: { navigate: NavigateFunction; location: Location } | null = null

/** App: после каждой смены адреса (useLayoutEffect). */
export function bindNavigator(navigate: NavigateFunction, location: Location): void {
  current = { navigate, location }
}

/**
 * Карточка поверх текущего экрана: экран под шитом запоминается в location.state.background;
 * из одной карточки в другую — с replace, чтобы «назад» закрывал шит, а не листал карточки.
 * Задача, которую уже знает строка списка, кладётся в кэш подсказкой — карточка рисуется сразу.
 */
export function openTask(id: number, known?: Task): void {
  if (!current) return
  if (known) cache.prime(`task:${id}`, known)
  const { navigate, location } = current
  const bg = (location.state as SheetState | null)?.background
  navigate(`/task/${id}`, { state: { background: bg ?? location }, replace: Boolean(bg) })
}
