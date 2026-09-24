import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../api/client'
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  patchTask,
  reorderTasks,
} from '../api/tasks'
import type { DateStr, NewTask, ReorderScope, Stats, Task, TaskPatch } from '../api/types'
import { addDays, todayStr } from '../lib/date'
import { notifyChanged, subscribeChanges } from '../lib/sync'

// Что показывает экран списка: смарт-вид или конкретный список.
export type ListSpec =
  | { view: 'today' | 'week' | 'overdue' | 'inbox' | 'all' }
  | { view: 'project'; projectId: number }

/** Область для POST /tasks/reorder; у смарт-видов (кроме «Входящих») её нет — там не перетаскиваем. */
export function reorderScopeOf(spec: ListSpec): ReorderScope | null {
  if (spec.view === 'project') return { type: 'project', project_id: spec.projectId }
  if (spec.view === 'inbox') return { type: 'inbox' }
  return null
}

/** Попадает ли задача в выдачу вида — зеркало условий вьюх на бэкенде (корневые и невыполненные). */
export function matchesSpec(t: Task, spec: ListSpec, today: DateStr): boolean {
  if (t.parent_id !== null) return false
  switch (spec.view) {
    case 'all':
      return true
    case 'today':
      return t.scheduled_for === today
    case 'week': {
      const end = addDays(today, 7)
      const inRange = (d: DateStr | null) => d !== null && d >= today && d <= end
      return inRange(t.due_date) || inRange(t.scheduled_for)
    }
    case 'overdue':
      return t.due_date !== null && t.due_date < today
    case 'inbox':
      return t.project_id === null
    case 'project':
      return t.project_id === spec.projectId
  }
}

function byPosition(a: Task, b: Task): number {
  return a.position - b.position || a.id - b.id
}

/**
 * Задачи одного вида: загрузка, оптимистичные мутации с откатом и порядок через /tasks/reorder.
 * Выполненные задачи из выдачи уходят сразу после подтверждения сервером.
 */
export function useTasks(spec: ListSpec) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const specKey = spec.view === 'project' ? `project:${spec.projectId}` : spec.view
  const specRef = useRef(spec)
  specRef.current = spec
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  // номер последнего запроса: ответ на устаревший (сменили список, пока грузилось) выбрасываем
  const reqRef = useRef(0)

  const fetchTasks = useCallback(async () => {
    const s = specRef.current
    const req = ++reqRef.current
    const data = await listTasks({
      view: s.view,
      project_id: s.view === 'project' ? s.projectId : undefined,
      today: todayStr(),
    })
    return req === reqRef.current ? data.items : null
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await fetchTasks()
      if (items === null) return
      setTasks(items)
      setLoading(false)
    } catch (e) {
      setError(errorText(e, 'не удалось загрузить задачи'))
      setTasks([])
      setLoading(false)
    }
  }, [fetchTasks])

  // тихое перечитывание по сигналу из другого места (карточка задачи, другой экран)
  const refresh = useCallback(async () => {
    try {
      const items = await fetchTasks()
      if (items === null) return
      setTasks(items)
      setError(null)
    } catch {
      /* оставляем то, что уже на экране */
    }
  }, [fetchTasks])

  useEffect(() => {
    load()
  }, [load, specKey])

  useEffect(() => subscribeChanges(refresh), [refresh])

  const fail = useCallback((e: unknown, snapshot: Task[]) => {
    setTasks(snapshot)
    setActionError(errorText(e))
  }, [])

  // ── мутации ────────────────────────────────────────────────────────────────

  const add = useCallback(
    async (nt: NewTask) => {
      try {
        const created = await createTask(nt)
        if (matchesSpec(created, specRef.current, todayStr())) {
          setTasks((prev) => [...prev, created].sort(byPosition))
        }
        notifyChanged(refresh)
        return created
      } catch (e) {
        setActionError(errorText(e))
        return null
      }
    },
    [refresh],
  )

  const update = useCallback(
    async (id: number, patch: TaskPatch) => {
      const snapshot = tasksRef.current
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      try {
        const saved = await patchTask(id, patch)
        setTasks((prev) =>
          saved.done || !matchesSpec(saved, specRef.current, todayStr())
            ? prev.filter((t) => t.id !== id)
            : prev.map((t) => (t.id === id ? { ...saved, subtask_stats: t.subtask_stats } : t)),
        )
        notifyChanged(refresh)
      } catch (e) {
        fail(e, snapshot)
      }
    },
    [fail, refresh],
  )

  const remove = useCallback(
    async (id: number) => {
      const snapshot = tasksRef.current
      setTasks((prev) => prev.filter((t) => t.id !== id))
      try {
        await deleteTask(id)
        notifyChanged(refresh)
      } catch (e) {
        fail(e, snapshot)
      }
    },
    [fail, refresh],
  )

  /**
   * Перестановка внутри одного отрезка списка (секции или её части). Остальные задачи
   * держат свои места: новый порядок отрезка вписывается в те же слоты общего порядка,
   * а на сервер уходит полный порядок вида.
   */
  const reorder = useCallback(
    async (newRun: number[]) => {
      const scope = reorderScopeOf(specRef.current)
      if (!scope) return
      const snapshot = tasksRef.current
      const inRun = new Set(newRun)
      const ordered = [...snapshot].sort(byPosition)
      let i = 0
      const ids = ordered.map((t) => (inRun.has(t.id) ? newRun[i++] : t.id))
      if (ids.every((id, k) => id === ordered[k].id)) return

      const pos = new Map(ids.map((id, k) => [id, k]))
      setTasks((prev) => prev.map((t) => ({ ...t, position: pos.get(t.id) ?? t.position })).sort(byPosition))
      try {
        await reorderTasks(scope, ids)
        notifyChanged(refresh)
      } catch (e) {
        fail(e, snapshot)
      }
    },
    [fail, refresh],
  )

  return {
    tasks,
    loading,
    error,
    actionError,
    clearActionError: () => setActionError(null),
    reload: load,
    add,
    update,
    remove,
    reorder,
  }
}

export function statsOf(subtasks: Task[]): Stats {
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length }
}

/**
 * Одна задача с подзадачами (GET /tasks/{id}) — для карточки и раскрытой строки.
 * Мутации оптимистичные; после каждой остальные экраны получают сигнал перечитаться.
 */
export function useTask(id: number | null) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(id !== null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const taskRef = useRef(task)
  taskRef.current = task

  const refresh = useCallback(async () => {
    if (id === null) return
    try {
      setTask(await getTask(id))
      setError(null)
    } catch {
      /* тихо: на экране остаётся прежнее */
    }
  }, [id])

  useEffect(() => {
    if (id === null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getTask(id)
      .then((t) => {
        if (!cancelled) setTask(t)
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e, 'не удалось загрузить задачу'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => subscribeChanges(refresh), [refresh])

  const run = useCallback(
    async (optimistic: (t: Task) => Task, action: () => Promise<unknown>): Promise<boolean> => {
      const snapshot = taskRef.current
      if (snapshot) setTask(optimistic(snapshot))
      try {
        await action()
        await refresh()
        notifyChanged(refresh)
        return true
      } catch (e) {
        setTask(snapshot)
        setActionError(errorText(e))
        return false
      }
    },
    [refresh],
  )

  const update = useCallback(
    (patch: TaskPatch) =>
      id === null ? Promise.resolve(false) : run((t) => ({ ...t, ...patch }), () => patchTask(id, patch)),
    [id, run],
  )

  const addSubtask = useCallback(
    (title: string) =>
      id === null ? Promise.resolve(false) : run((t) => t, () => createTask({ title, parent_id: id })),
    [id, run],
  )

  const updateSubtask = useCallback(
    (sid: number, patch: TaskPatch) =>
      run(
        (t) => ({ ...t, subtasks: t.subtasks?.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }),
        () => patchTask(sid, patch),
      ),
    [run],
  )

  const removeSubtask = useCallback(
    (sid: number) =>
      run((t) => ({ ...t, subtasks: t.subtasks?.filter((s) => s.id !== sid) }), () => deleteTask(sid)),
    [run],
  )

  const remove = useCallback(async () => {
    if (id === null) return false
    try {
      await deleteTask(id)
      notifyChanged(refresh) // себя не перечитываем: задачи уже нет
      return true
    } catch (e) {
      setActionError(errorText(e))
      return false
    }
  }, [id, refresh])

  return {
    task,
    loading,
    error,
    actionError,
    clearActionError: () => setActionError(null),
    update,
    addSubtask,
    updateSubtask,
    removeSubtask,
    remove,
  }
}

type SmartKey = 'today' | 'week' | 'overdue' | 'all' | 'inbox'
export type SmartCounts = Record<SmartKey, number>

const SMART_KEYS: SmartKey[] = ['today', 'week', 'overdue', 'all', 'inbox']

/** Счётчики смарт-видов для экрана «Списки»: total с limit=1, сами задачи не тянем. */
export function useSmartCounts() {
  const [counts, setCounts] = useState<SmartCounts | null>(null)

  const load = useCallback(async () => {
    const today = todayStr()
    try {
      const totals = await Promise.all(
        SMART_KEYS.map((view) => listTasks({ view, today, limit: 1 }).then((r) => r.total)),
      )
      setCounts(Object.fromEntries(SMART_KEYS.map((k, i) => [k, totals[i]])) as SmartCounts)
    } catch {
      /* без счётчиков экран всё равно рабочий */
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeChanges(load), [load])

  return counts
}

/** «N / M за неделю»: N — выполнено за последние 7 дней, M = N + активные. */
export function useWeekProgress(projectId: number | null, active: number) {
  const [doneWeek, setDoneWeek] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (projectId === null) return
    const today = todayStr()
    try {
      const r = await listTasks({
        view: 'archive',
        project_id: projectId,
        from: addDays(today, -6),
        to: today,
        today,
        limit: 1,
      })
      setDoneWeek(r.total)
    } catch {
      setDoneWeek(null)
    }
  }, [projectId])

  useEffect(() => {
    setDoneWeek(null)
    load()
  }, [load])
  useEffect(() => subscribeChanges(load), [load])

  return doneWeek === null ? null : { done: doneWeek, total: doneWeek + active }
}
