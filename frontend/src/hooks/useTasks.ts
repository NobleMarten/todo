import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { errorText } from '../api/client'
import {
  createTask,
  getTask,
  listTasks,
  patchTask,
  reorderTasks,
  taskCounts,
} from '../api/tasks'
import type { DateStr, NewTask, ReorderScope, Stats, Task, TaskPatch } from '../api/types'
import { addDays, todayStr } from '../lib/date'
import { scheduleDelete } from '../lib/pendingDelete'
import { cache } from '../lib/cache'
import { useCached } from './useCached'

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

const NO_TASKS: Task[] = []

function byPosition(a: Task, b: Task): number {
  return a.position - b.position || a.id - b.id
}

/**
 * Задачи одного вида: из общего кэша (hooks/useCached), оптимистичные мутации с откатом
 * и порядок через /tasks/reorder. Выполненные задачи из выдачи уходят сразу после подтверждения сервером.
 */
export function useTasks(spec: ListSpec) {
  const today = todayStr()
  const specKey = spec.view === 'project' ? `project:${spec.projectId}` : spec.view
  const c = useCached<Task[]>(
    `tasks:${specKey}:${today}`,
    () =>
      listTasks({ view: spec.view, project_id: spec.view === 'project' ? spec.projectId : undefined, today }).then(
        (r) => r.items,
      ),
    { errorText: 'не удалось загрузить задачи' },
  )
  const { set: setTasks, refresh, notify } = c
  const tasks = c.data ?? NO_TASKS
  const [actionError, setActionError] = useState<string | null>(null)

  const specRef = useRef(spec)
  const tasksRef = useRef(tasks)
  useLayoutEffect(() => {
    specRef.current = spec
    tasksRef.current = tasks
  })

  const fail = useCallback(
    (e: unknown, snapshot: Task[]) => {
      setTasks(snapshot)
      setActionError(errorText(e))
    },
    [setTasks],
  )

  // ── мутации ────────────────────────────────────────────────────────────────

  const add = useCallback(
    async (nt: NewTask) => {
      try {
        const created = await createTask(nt)
        if (matchesSpec(created, specRef.current, todayStr())) {
          setTasks((prev = []) => [...prev, created].sort(byPosition))
        }
        notify()
        return created
      } catch (e) {
        setActionError(errorText(e))
        return null
      }
    },
    [setTasks, notify],
  )

  const update = useCallback(
    async (id: number, patch: TaskPatch) => {
      const snapshot = tasksRef.current
      const repeats = patch.done === true && snapshot.some((t) => t.id === id && t.repeat)
      setTasks((prev = []) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      try {
        const saved = await patchTask(id, patch)
        setTasks((prev = []) =>
          saved.done || !matchesSpec(saved, specRef.current, todayStr())
            ? prev.filter((t) => t.id !== id)
            : prev.map((t) => (t.id === id ? { ...saved, subtask_stats: t.subtask_stats } : t)),
        )
        notify()
        // выполнили повторяющуюся — сервер создал следующую, её надо подтянуть и в этот вид
        if (repeats) void refresh()
      } catch (e) {
        fail(e, snapshot)
      }
    },
    [setTasks, fail, refresh, notify],
  )

  /** Удалить с «вернуть»: строка пропадает сразу, запрос — через 5 с (lib/pendingDelete). */
  const remove = useCallback((id: number) => {
    const task = tasksRef.current.find((t) => t.id === id)
    setTasks((prev = []) => prev.filter((t) => t.id !== id))
    scheduleDelete(id, task?.title ?? '')
  }, [setTasks])

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
      setTasks((prev = []) => prev.map((t) => ({ ...t, position: pos.get(t.id) ?? t.position })).sort(byPosition))
      try {
        await reorderTasks(scope, ids)
        notify()
      } catch (e) {
        fail(e, snapshot)
      }
    },
    [setTasks, fail, notify],
  )

  return {
    tasks,
    loading: c.loading,
    error: c.error,
    actionError,
    clearActionError: () => setActionError(null),
    reload: c.reload,
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
 * Одна задача с подзадачами (GET /tasks/{id}) — для карточки и раскрытой строки, из общего кэша.
 * Карточка, открытая из строки списка, сразу рисует задачу из строки (hooks/useOpenTask кладёт её
 * подсказкой), подзадачи догружаются в фоне. Мутации оптимистичные; ответ сервера сразу кладётся
 * во все загруженные экраны (cache.patchTask), остальные экраны получают сигнал перечитаться.
 */
export function useTask(id: number | null) {
  const c = useCached<Task>(id === null ? null : `task:${id}`, () => getTask(id!), {
    errorText: 'не удалось загрузить задачу',
  })
  const { set: setTask, notify } = c
  const task = c.data ?? null
  const [actionError, setActionError] = useState<string | null>(null)
  const taskRef = useRef(task)
  useLayoutEffect(() => {
    taskRef.current = task
  })

  const run = useCallback(
    async <R,>(optimistic: (t: Task) => Task, action: () => Promise<R>, apply: (t: Task, res: R) => Task) => {
      const snapshot = taskRef.current
      if (snapshot) setTask(optimistic(snapshot))
      try {
        const res = await action()
        setTask((t) => t && apply(t, res))
        notify()
        return true
      } catch (e) {
        if (snapshot) {
          setTask(snapshot)
          cache.patchTask(snapshot) // откат и в строках списков
        }
        setActionError(errorText(e))
        return false
      }
    },
    [setTask, notify],
  )

  const update = useCallback(
    (patch: TaskPatch) =>
      id === null
        ? Promise.resolve(false)
        : run(
            (t) => {
              // строка под шитом меняется вместе с карточкой, не дожидаясь сервера
              const next = { ...t, ...patch }
              cache.patchTask(next)
              return next
            },
            async () => {
              const saved = await patchTask(id, patch)
              cache.patchTask(saved)
              return saved
            },
            (t, saved) => ({ ...t, ...saved, subtasks: t.subtasks }),
          ),
    [id, run],
  )

  const addSubtask = useCallback(
    (title: string) =>
      id === null
        ? Promise.resolve(false)
        : run(
            (t) => t,
            () => createTask({ title, parent_id: id }),
            (t, created) => ({ ...t, subtasks: [...(t.subtasks ?? []), created] }),
          ),
    [id, run],
  )

  const updateSubtask = useCallback(
    (sid: number, patch: TaskPatch) =>
      run(
        (t) => ({ ...t, subtasks: t.subtasks?.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }),
        async () => {
          const saved = await patchTask(sid, patch)
          cache.patchTask(saved)
          return saved
        },
        (t, saved) => ({ ...t, subtasks: t.subtasks?.map((s) => (s.id === sid ? saved : s)) }),
      ),
    [run],
  )

  const removeSubtask = useCallback(
    (sid: number) => {
      const sub = taskRef.current?.subtasks?.find((s) => s.id === sid)
      setTask((t) => t && { ...t, subtasks: t.subtasks?.filter((s) => s.id !== sid) })
      scheduleDelete(sid, sub?.title ?? '')
      notify() // счётчик подзадач в строках списка
    },
    [setTask, notify],
  )

  /** Удалить задачу с «вернуть»; карточку закрывает вызывающий. */
  const remove = useCallback(async () => {
    if (id === null) return false
    scheduleDelete(id, taskRef.current?.title ?? '')
    notify()
    return true
  }, [id, notify])

  return {
    task,
    loading: c.loading,
    error: c.error,
    actionError,
    clearActionError: () => setActionError(null),
    update,
    addSubtask,
    updateSubtask,
    removeSubtask,
    remove,
  }
}

export type SmartCounts = Record<'today' | 'week' | 'overdue' | 'all' | 'inbox', number>

/** Счётчики смарт-видов для экрана «Списки» — одним GET /tasks/counts, сами задачи не тянем. */
export function useSmartCounts() {
  const today = todayStr()
  // без счётчиков экран всё равно рабочий: ошибку не показываем
  return useCached<SmartCounts>(`counts:${today}`, () => taskCounts(today), { errorText: '' }).data ?? null
}

/** «N / M за неделю»: N — выполнено за последние 7 дней, M = N + активные. */
export function useWeekProgress(projectId: number | null, active: number) {
  const today = todayStr()
  const doneWeek = useCached<number>(
    projectId === null ? null : `weekDone:${projectId}:${today}`,
    () =>
      listTasks({ view: 'archive', project_id: projectId!, from: addDays(today, -6), to: today, today, limit: 1 }).then(
        (r) => r.total,
      ),
    { errorText: '' },
  ).data
  return doneWeek === undefined ? null : { done: doneWeek, total: doneWeek + active }
}

const ARCHIVE_PAGE = 50
const ARCHIVE_MAX = 200 // лимит бэкенда для view=archive

// Чьи выполненные: одного списка или входящих; без области — все («Итоги»).
export type ArchiveScope = { view: 'project'; projectId: number } | { view: 'inbox' }

type ArchivePage = { items: Task[]; total: number }

/** Выполненные задачи (свежие сверху) страницами по 50 и «показать ещё» — из общего кэша. */
export function useArchive(scope?: ArchiveScope) {
  const scopeKey = !scope ? 'all' : scope.view === 'project' ? `project:${scope.projectId}` : 'inbox'
  const key = `archive:${scopeKey}`
  const fetchPage = useCallback(
    (offset: number, limit: number) => {
      const base = { today: todayStr(), sort: 'done_at', order: 'desc', limit, offset } as const
      if (scopeKey === 'inbox') return listTasks({ ...base, view: 'inbox', done: true })
      if (scopeKey.startsWith('project:')) {
        return listTasks({ ...base, view: 'archive', project_id: Number(scopeKey.slice('project:'.length)) })
      }
      return listTasks({ ...base, view: 'archive' })
    },
    [scopeKey],
  )
  // перечитываем столько, сколько уже показано: «показать ещё» не сбрасывается
  const c = useCached<ArchivePage>(
    key,
    () => {
      const shown = cache.get<ArchivePage>(key)?.items.length ?? 0
      return fetchPage(0, Math.min(ARCHIVE_MAX, Math.max(ARCHIVE_PAGE, shown)))
    },
    { errorText: 'не удалось загрузить выполненные' },
  )
  const { set, notify } = c
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const page = c.data
  const pageRef = useRef(page)
  useLayoutEffect(() => {
    pageRef.current = page
  })

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const r = await fetchPage(pageRef.current?.items.length ?? 0, ARCHIVE_PAGE)
      set((p) => {
        const items = p?.items ?? []
        const seen = new Set(items.map((t) => t.id))
        return { items: [...items, ...r.items.filter((t) => !seen.has(t.id))], total: r.total }
      })
    } catch (e) {
      setActionError(errorText(e))
    } finally {
      setLoadingMore(false)
    }
  }, [fetchPage, set])

  /** Вернуть задачу в активные: из архива она уходит сразу. */
  const undo = useCallback(
    async (id: number) => {
      const snapshot = pageRef.current
      set((p) => p && { items: p.items.filter((t) => t.id !== id), total: p.total - 1 })
      try {
        await patchTask(id, { done: false })
        notify()
      } catch (e) {
        if (snapshot) set(snapshot)
        setActionError(errorText(e))
      }
    },
    [set, notify],
  )

  return {
    items: page?.items ?? NO_TASKS,
    total: page?.total ?? 0,
    loading: c.loading,
    loadingMore,
    error: c.error,
    actionError,
    clearActionError: () => setActionError(null),
    reload: c.reload,
    loadMore,
    undo,
  }
}
