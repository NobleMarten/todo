import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorText } from '../api/client'
import { getDay, getSuggestions, planDay } from '../api/day'
import { deleteTask, patchTask, reorderTasks } from '../api/tasks'
import type { DateStr, Day, Suggestions, Task, TaskPatch } from '../api/types'
import { todayStr } from '../lib/date'
import { notifyChanged, subscribeChanges } from '../lib/sync'

type ActiveBlock = 'planned' | 'overdue' | 'carry_over'
const ACTIVE_BLOCKS: ActiveBlock[] = ['planned', 'overdue', 'carry_over']

function without(d: Day, ids: Set<number>): Day {
  return {
    ...d,
    planned: d.planned.filter((t) => !ids.has(t.id)),
    overdue: d.overdue.filter((t) => !ids.has(t.id)),
    carry_over: d.carry_over.filter((t) => !ids.has(t.id)),
    done_today: d.done_today.filter((t) => !ids.has(t.id)),
  }
}

function findTask(d: Day, id: number): Task | undefined {
  for (const b of [...ACTIVE_BLOCKS, 'done_today'] as const) {
    const t = d[b].find((x) => x.id === id)
    if (t) return t
  }
}

/**
 * Экран «Сегодня» (GET /day) за локальную дату устройства. Мутации оптимистичные с откатом;
 * после ответа сервера день перечитывается целиком — раскладку по блокам решает бэкенд.
 */
export function useDay() {
  const [day, setDay] = useState<Day | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const dayRef = useRef(day)
  useLayoutEffect(() => {
    dayRef.current = day
  })
  const reqRef = useRef(0)

  const fetchDay = useCallback(async () => {
    const req = ++reqRef.current
    const d = await getDay(todayStr())
    return req === reqRef.current ? d : null
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchDay()
      if (d === null) return
      setDay(d)
      setLoading(false)
    } catch (e) {
      setError(errorText(e, 'не удалось загрузить день'))
      setLoading(false)
    }
  }, [fetchDay])

  const refresh = useCallback(async () => {
    try {
      const d = await fetchDay()
      if (d === null) return
      setDay(d)
      setError(null)
    } catch {
      /* оставляем то, что уже на экране */
    }
  }, [fetchDay])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeChanges(refresh), [refresh])

  // PWA может провисеть открытой всю ночь: вернулись на экран в новый день — грузим новый день
  useEffect(() => {
    const onVisible = () => {
      const d = dayRef.current
      if (document.visibilityState === 'visible' && d && d.date !== todayStr()) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const run = useCallback(
    async (optimistic: (d: Day) => Day, action: () => Promise<unknown>) => {
      const snapshot = dayRef.current
      if (snapshot) setDay(optimistic(snapshot))
      try {
        await action()
        await refresh()
        notifyChanged(refresh)
      } catch (e) {
        setDay(snapshot)
        setActionError(errorText(e))
      }
    },
    [refresh],
  )

  /** Выполнить / вернуть. Выполненная сразу уезжает в «готово», возвращённая — из него. */
  const toggle = useCallback(
    (task: Task) => {
      const done = !task.done
      return run(
        (d) => {
          const rest = without(d, new Set([task.id]))
          return done
            ? { ...rest, done_today: [{ ...task, done: true }, ...rest.done_today] }
            : { ...rest, planned: task.scheduled_for === d.date ? [...rest.planned, { ...task, done: false }] : rest.planned }
        },
        () => patchTask(task.id, { done }),
      )
    },
    [run],
  )

  const update = useCallback(
    (id: number, patch: TaskPatch) =>
      run(
        (d) => {
          const upd = (xs: Task[]) => xs.map((t) => (t.id === id ? { ...t, ...patch } : t))
          return { ...d, planned: upd(d.planned), overdue: upd(d.overdue), carry_over: upd(d.carry_over) }
        },
        () => patchTask(id, patch),
      ),
    [run],
  )

  /** Удалить (свайп влево): задача сразу пропадает из своего блока. */
  const remove = useCallback(
    (id: number) => run((d) => without(d, new Set([id])), () => deleteTask(id)),
    [run],
  )

  /** «Перенести на сегодня»: одним POST /day/plan, задачи встают в конец плана. */
  const moveToToday = useCallback(
    (ids: number[]) => {
      const d0 = dayRef.current
      if (!d0 || ids.length === 0) return Promise.resolve()
      return run(
        (d) => {
          const moved = ids.map((id) => findTask(d, id)).filter((t): t is Task => Boolean(t))
          const rest = without(d, new Set(ids))
          return { ...rest, planned: [...rest.planned, ...moved.map((t) => ({ ...t, scheduled_for: d.date }))] }
        },
        () => planDay(d0.date, ids),
      )
    },
    [run],
  )

  /** Новый порядок плана дня (полный список planned). */
  const reorderPlanned = useCallback(
    (ids: number[]) => {
      const d0 = dayRef.current
      if (!d0) return Promise.resolve()
      const byId = new Map(d0.planned.map((t) => [t.id, t]))
      return run(
        (d) => ({ ...d, planned: ids.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t)) }),
        () => reorderTasks({ type: 'day', date: d0.date }, ids),
      )
    },
    [run],
  )

  return {
    day,
    loading,
    error,
    actionError,
    clearActionError: () => setActionError(null),
    reload: load,
    toggle,
    update,
    remove,
    moveToToday,
    reorderPlanned,
  }
}

/**
 * «Собрать день»: подсказки и сколько уже запланировано (для «начать день · N задач»).
 * Выбор живёт на экране; commit шлёт один POST /day/plan.
 */
export function useSuggestions() {
  const [date] = useState<DateStr>(todayStr)
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  const [plannedCount, setPlannedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, d] = await Promise.all([getSuggestions(date), getDay(date)])
      setSuggestions(s)
      setPlannedCount(d.counts.planned)
    } catch (e) {
      setError(errorText(e, 'не удалось загрузить подсказки'))
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  const commit = useCallback(
    async (ids: number[]) => {
      if (ids.length > 0) {
        await planDay(date, ids)
        notifyChanged()
      }
    },
    [date],
  )

  return { date, suggestions, plannedCount, loading, error, reload: load, commit }
}
