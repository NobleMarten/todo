import { ApiError, errorText } from '../api/client'
import { deleteTask } from '../api/tasks'
import { hide, unhide } from './deleting'
import { notifyChanged } from './sync'

// Удаление с «вернуть»: задача сразу пропадает с экранов, DELETE уходит через UNDO_MS.
// Отложенное удаление одно: следующее сразу проводит предыдущее. Приложение ушло в фон
// (свернули PWA, переключили вкладку) — проводим сейчас, пока JS ещё жив. Если вкладку убили
// раньше — задача просто остаётся, это безопасная сторона.

export const UNDO_MS = 5000

export type PendingState =
  | { kind: 'pending'; id: number; title: string }
  | { kind: 'error'; message: string }
  | null

type Pending = { id: number; title: string; timer: ReturnType<typeof setTimeout> }

let current: Pending | null = null
let state: PendingState = null
const listeners = new Set<(s: PendingState) => void>()
let lifecycleBound = false

function setState(s: PendingState) {
  state = s
  listeners.forEach((fn) => fn(s))
}

export function subscribePending(fn: (s: PendingState) => void): () => void {
  listeners.add(fn)
  fn(state)
  return () => {
    listeners.delete(fn)
  }
}

function bindLifecycle() {
  if (lifecycleBound || typeof document === 'undefined') return
  lifecycleBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushDelete()
  })
  window.addEventListener('pagehide', () => void flushDelete())
}

/** Спрятать задачу и удалить её на сервере через UNDO_MS, если не нажмут «вернуть». */
export function scheduleDelete(id: number, title: string): void {
  bindLifecycle()
  if (current) void flushDelete()
  hide(id)
  current = { id, title, timer: setTimeout(() => void flushDelete(), UNDO_MS) }
  setState({ kind: 'pending', id, title })
}

/** «Вернуть»: задача снова видна, все экраны перечитываются. */
export function undoDelete(): void {
  if (!current) return
  clearTimeout(current.timer)
  unhide(current.id)
  current = null
  setState(null)
  notifyChanged()
}

/** Провести отложенное удаление сейчас. Ошибка — задача возвращается, внизу сообщение. */
export async function flushDelete(): Promise<void> {
  const p = current
  if (!p) return
  clearTimeout(p.timer)
  current = null
  if (state?.kind === 'pending' && state.id === p.id) setState(null)
  try {
    await deleteTask(p.id)
  } catch (e) {
    // уже удалена (например, каскадом вместе с родителем) — цель достигнута
    const gone = e instanceof ApiError && e.code === 'TASK_NOT_FOUND'
    if (!gone) {
      unhide(p.id)
      notifyChanged()
      setState({ kind: 'error', message: `не удалось удалить «${p.title}»: ${errorText(e)}` })
      return
    }
  }
  unhide(p.id) // на сервере её больше нет — держать в фильтре незачем
  notifyChanged()
}

export function dismissPendingError(): void {
  if (state?.kind === 'error') setState(null)
}
