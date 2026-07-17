import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getTodos,
  addTodo as apiAdd,
  setDone as apiSetDone,
  patchTodo as apiPatch,
  deleteTodo as apiDelete,
  clearTodos as apiClear,
  type Task,
  type FilterDone,
} from '../api'
import { todayKey, type Section } from '../lib/format'

/** Manual drag order is stored per section so orders never bleed across sections. */
export type Orders = Record<Section, number[]>

const ORDER_KEY = 'todo-manual-order'
const EMPTY_ORDERS: Orders = { daily: [], high: [], medium: [], low: [] }
const SECTION_KEYS: Section[] = ['daily', 'high', 'medium', 'low']

function loadOrders(): Orders {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return { ...EMPTY_ORDERS }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // only keep the known section keys; older shapes (flat array / today+rest) are dropped
    const next: Orders = { ...EMPTY_ORDERS }
    for (const k of SECTION_KEYS) {
      const v = parsed?.[k]
      if (Array.isArray(v)) next[k] = v as number[]
    }
    return next
  } catch {
    return { ...EMPTY_ORDERS }
  }
}

/** Order `tasks` by a saved id list; unknown ids keep their relative order at the front. */
export function applyManualOrder(tasks: Task[], order: number[]): Task[] {
  if (order.length === 0) return tasks
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...tasks].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id)! : -1
    const rb = rank.has(b.id) ? rank.get(b.id)! : -1
    return ra - rb
  })
}

/**
 * Owns all task data: filter/date UI state, fetching, and optimistic mutations.
 * Keeps a per-section manual drag order persisted in localStorage.
 */
export function useTodos() {
  const [todos, setTodos] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<FilterDone>('false')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [orders, setOrders] = useState<Orders>(loadOrders)
  // keep latest orders without re-creating load()/mutations on every drag
  const ordersRef = useRef(orders)
  ordersRef.current = orders

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const apiFilter: FilterDone = filter === 'true' ? 'true' : 'all'
      const data = await getTodos({
        done: apiFilter,
        from: from || undefined,
        to: to || undefined,
      })
      setTodos(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
      setTodos([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filter, from, to])

  useEffect(() => {
    load()
  }, [load])

  const persistOrders = useCallback((next: Orders) => {
    setOrders(next)
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota errors */
    }
  }, [])

  // ── mutations ─────────────────────────────────────────────────────────────

  const add = useCallback(
    async (title: string, priority: string, daily = false) => {
      const created = await apiAdd(title, priority)
      // optionally pin the fresh task to "на сегодня" in the same flow
      if (daily) {
        try {
          await apiPatch(created.id, { daily: true })
        } catch {
          /* task is created; just not marked daily — surfaces on next load */
        }
      }
      // daily wins → the task lands in the daily section, otherwise its priority; at the top
      const key: Section = daily
        ? 'daily'
        : (priority as Section) in ordersRef.current
          ? (priority as Section)
          : 'low'
      const cur = ordersRef.current
      persistOrders({ ...cur, [key]: [created.id, ...cur[key].filter((id) => id !== created.id)] })
      await load()
    },
    [load, persistOrders],
  )

  const toggle = useCallback(
    async (task: Task) => {
      setTodos((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)))
      try {
        await apiSetDone(task.id, !task.done)
        await load()
      } catch {
        setTodos((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)))
      }
    },
    [load],
  )

  const remove = useCallback(
    async (id: number) => {
      try {
        await apiDelete(id)
        const cur = ordersRef.current
        const next = {} as Orders
        for (const k of SECTION_KEYS) next[k] = cur[k].filter((x) => x !== id)
        persistOrders(next)
        await load()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Не удалось удалить')
      }
    },
    [load, persistOrders],
  )

  const clear = useCallback(async () => {
    try {
      await apiClear()
      persistOrders({ ...EMPTY_ORDERS })
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось очистить')
    }
  }, [load, persistOrders])

  const editTitle = useCallback(
    async (id: number, title: string) => {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
      try {
        await apiPatch(id, { title })
      } catch {
        await load()
      }
    },
    [load],
  )

  const setPriority = useCallback(
    async (id: number, priority: string) => {
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, priority: priority as Task['priority'] } : t)),
      )
      try {
        await apiPatch(id, { priority })
      } catch {
        await load()
      }
    },
    [load],
  )

  const setDaily = useCallback(
    async (id: number, daily: boolean) => {
      // optimistic: use today's *local* date so isDailyTask matches immediately (any tz)
      const optimistic = daily ? `${todayKey()}T00:00:00Z` : null
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, daily_date: optimistic } : t)))
      try {
        const updated = await apiPatch(id, { daily })
        setTodos((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
      } catch {
        await load()
      }
    },
    [load],
  )

  /**
   * Move a task to a section (used by cross-boundary drag). `daily` toggles the flag;
   * any other section sets that priority and clears daily. One optimistic update + one PATCH.
   */
  const moveToSection = useCallback(
    async (id: number, section: Section) => {
      const daily = section === 'daily'
      setTodos((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = { ...t }
          next.daily_date = daily ? `${todayKey()}T00:00:00Z` : null
          if (!daily) next.priority = section as Task['priority']
          return next
        }),
      )
      const fields: { daily: boolean; priority?: string } = { daily }
      if (!daily) fields.priority = section
      try {
        const updated = await apiPatch(id, fields)
        setTodos((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
      } catch {
        await load()
      }
    },
    [load],
  )

  return {
    todos,
    total,
    loading,
    error,
    setError,
    filter,
    setFilter,
    from,
    setFrom,
    to,
    setTo,
    orders,
    reorderAll: persistOrders,
    reload: load,
    add,
    toggle,
    remove,
    clear,
    editTitle,
    setPriority,
    setDaily,
    moveToSection,
  }
}
