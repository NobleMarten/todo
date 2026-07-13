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

export type Sort = '' | 'created_at' | 'priority'

/** Manual drag order is stored per section so orders never bleed across sections. */
export type SectionKey = 'today' | 'rest'
export type Orders = Record<SectionKey, number[]>

const ORDER_KEY = 'todo-manual-order'
const EMPTY_ORDERS: Orders = { today: [], rest: [] }

function loadOrders(): Orders {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return { ...EMPTY_ORDERS }
    const parsed = JSON.parse(raw) as unknown
    // migrate the previous flat id list → treat it as the "rest" section
    if (Array.isArray(parsed)) return { today: [], rest: parsed as number[] }
    const o = parsed as Partial<Orders>
    return { today: o.today ?? [], rest: o.rest ?? [] }
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
 * Owns all task data: filter/sort UI state, fetching, and optimistic mutations.
 * Keeps a manual drag order persisted in localStorage.
 */
export function useTodos() {
  const [todos, setTodos] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<FilterDone>('false')
  const [sort, setSort] = useState<Sort>('priority')
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

  /** Replace the manual order of a single section (drag reorder within a section). */
  const reorder = useCallback(
    (section: SectionKey, ids: number[]) => {
      persistOrders({ ...ordersRef.current, [section]: ids })
    },
    [persistOrders],
  )

  // ── mutations ─────────────────────────────────────────────────────────────

  const add = useCallback(
    async (title: string, priority: string) => {
      const created = await apiAdd(title, priority)
      // a new task is not daily yet → it belongs to the "rest" section, at the top
      const cur = ordersRef.current
      persistOrders({ ...cur, rest: [created.id, ...cur.rest.filter((id) => id !== created.id)] })
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
        persistOrders({
          today: cur.today.filter((x) => x !== id),
          rest: cur.rest.filter((x) => x !== id),
        })
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
      // optimistic: reflect the daily flag locally right away
      const optimistic = daily ? new Date().toISOString() : null
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, daily_date: optimistic } : t)))
      try {
        // trust the server's daily_date (avoids depending on GET /todos returning it)
        const updated = await apiPatch(id, { daily })
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
    sort,
    setSort,
    from,
    setFrom,
    to,
    setTo,
    orders,
    reorder,
    reload: load,
    add,
    toggle,
    remove,
    clear,
    editTitle,
    setPriority,
    setDaily,
  }
}
