import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorText } from '../api/client'
import { getWeek } from '../api/day'
import { createTask, patchTask } from '../api/tasks'
import type { DateStr, NewTask, Task, TaskPatch, Week } from '../api/types'
import { todayStr } from '../lib/date'
import { scheduleDelete } from '../lib/pendingDelete'
import { notifyChanged, subscribeChanges } from '../lib/sync'

/** Неделя без задачи id во всех списках. */
function without(w: Week, id: number): Week {
  const drop = (xs: Task[]) => xs.filter((t) => t.id !== id)
  return {
    ...w,
    days: w.days.map((d) => ({ ...d, scheduled: drop(d.scheduled), deadlines: drop(d.deadlines), done: drop(d.done) })),
    upcoming: drop(w.upcoming),
    backlog: drop(w.backlog),
    backlog_total: w.backlog.some((t) => t.id === id) ? w.backlog_total - 1 : w.backlog_total,
  }
}

function findTask(w: Week, id: number): Task | undefined {
  for (const d of w.days) {
    const t = [...d.scheduled, ...d.deadlines, ...d.done].find((x) => x.id === id)
    if (t) return t
  }
  return [...w.upcoming, ...w.backlog].find((t) => t.id === id)
}

/**
 * Экран «Неделя» (GET /day/week) с from — понедельником по локальной дате. Мутации оптимистичные
 * с откатом; после ответа сервера неделя перечитывается целиком — раскладку по дням решает бэкенд.
 */
export function useWeek(from: DateStr) {
  const [week, setWeek] = useState<Week | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const weekRef = useRef(week)
  useLayoutEffect(() => {
    weekRef.current = week
  })
  const reqRef = useRef(0)

  const fetchWeek = useCallback(async () => {
    const req = ++reqRef.current
    const w = await getWeek(from)
    return req === reqRef.current ? w : null
  }, [from])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const w = await fetchWeek()
      if (w === null) return
      setWeek(w)
      setLoading(false)
    } catch (e) {
      setError(errorText(e, 'не удалось загрузить неделю'))
      setLoading(false)
    }
  }, [fetchWeek])

  const refresh = useCallback(async () => {
    try {
      const w = await fetchWeek()
      if (w !== null) {
        setWeek(w)
        setError(null)
      }
    } catch {
      /* оставляем то, что уже на экране */
    }
  }, [fetchWeek])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeChanges(refresh), [refresh])

  const run = useCallback(
    async (optimistic: (w: Week) => Week, action: () => Promise<unknown>) => {
      const snapshot = weekRef.current
      if (snapshot) setWeek(optimistic(snapshot))
      try {
        await action()
        await refresh()
        notifyChanged(refresh)
      } catch (e) {
        setWeek(snapshot)
        setActionError(errorText(e))
      }
    },
    [refresh],
  )

  /** Выполнить / вернуть. Выполненная сегодня уезжает в «готово» сегодняшнего дня, если он в неделе. */
  const toggle = useCallback(
    (task: Task) => {
      const done = !task.done
      const today = todayStr()
      return run(
        (w) => {
          const rest = without(w, task.id)
          if (!done) return rest
          return {
            ...rest,
            days: rest.days.map((d) => (d.date === today ? { ...d, done: [...d.done, { ...task, done: true }] } : d)),
          }
        },
        () => patchTask(task.id, { done }),
      )
    },
    [run],
  )

  /** «Делаю в этот день»: перетаскивание на день полосы, нажатие на задачу бэклога. */
  const schedule = useCallback(
    (task: Task, date: DateStr) => {
      if (task.scheduled_for === date) return Promise.resolve()
      return run(
        (w) => {
          const rest = without(w, task.id)
          const moved = { ...task, scheduled_for: date }
          return {
            ...rest,
            days: rest.days.map((d) => (d.date === date ? { ...d, scheduled: [...d.scheduled, moved] } : d)),
          }
        },
        () => patchTask(task.id, { scheduled_for: date }),
      )
    },
    [run],
  )

  const update = useCallback(
    (id: number, patch: TaskPatch) => {
      const upd = (xs: Task[]) => xs.map((t) => (t.id === id ? { ...t, ...patch } : t))
      return run(
        (w) => ({
          ...w,
          days: w.days.map((d) => ({ ...d, scheduled: upd(d.scheduled), deadlines: upd(d.deadlines) })),
          upcoming: upd(w.upcoming),
          backlog: upd(w.backlog),
        }),
        () => patchTask(id, patch),
      )
    },
    [run],
  )

  /** Удалить с «вернуть» (свайп влево). */
  const remove = useCallback((id: number) => {
    const w = weekRef.current
    const task = w ? findTask(w, id) : undefined
    setWeek((prev) => (prev ? without(prev, id) : prev))
    scheduleDelete(id, task?.title ?? '')
  }, [])

  const add = useCallback(
    async (nt: NewTask) => {
      try {
        const created = await createTask(nt)
        await refresh()
        notifyChanged(refresh)
        return created
      } catch (e) {
        setActionError(errorText(e))
        return null
      }
    },
    [refresh],
  )

  return {
    week: week && week.from === from ? week : null,
    staleWeek: week, // прошлая неделя, пока грузится новая: полоса не мигает пустотой
    loading,
    error,
    actionError,
    clearActionError: () => setActionError(null),
    reload: load,
    toggle,
    schedule,
    update,
    remove,
    add,
  }
}
