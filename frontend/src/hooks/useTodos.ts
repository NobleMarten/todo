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

const ORDER_KEY = 'todo-manual-order'

function loadOrder(): number[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
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
  const [sort, setSort] = useState<Sort>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [order, setOrder] = useState<number[]>(loadOrder)
  // keep latest order without re-creating load() on every drag
  const orderRef = useRef(order)
  orderRef.current = order

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

  const persistOrder = useCallback((ids: number[]) => {
    setOrder(ids)
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(ids))
    } catch {
      /* ignore quota errors */
    }
  }, [])

  // ── mutations ─────────────────────────────────────────────────────────────

  const add = useCallback(
    async (title: string, priority: string) => {
      const created = await apiAdd(title, priority)
      // new task goes to the top of the manual order
      persistOrder([created.id, ...orderRef.current.filter((id) => id !== created.id)])
      await load()
    },
    [load, persistOrder],
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
        persistOrder(orderRef.current.filter((x) => x !== id))
        await load()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Не удалось удалить')
      }
    },
    [load, persistOrder],
  )

  const clear = useCallback(async () => {
    try {
      await apiClear()
      persistOrder([])
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось очистить')
    }
  }, [load, persistOrder])

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
    order,
    reorder: persistOrder,
    reload: load,
    add,
    toggle,
    remove,
    clear,
    editTitle,
    setPriority,
  }
}
