import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../api/client'
import {
  createProject,
  deleteProject,
  listProjects,
  patchProject,
  reorderProjects,
} from '../api/projects'
import type { Project, ProjectPatch } from '../api/types'
import { todayStr } from '../lib/date'
import { notifyChanged, subscribeChanges } from '../lib/sync'

function byPosition(a: Project, b: Project): number {
  return a.position - b.position || a.id - b.id
}

/**
 * Все списки вместе с архивными (архив нужен, чтобы список можно было вернуть).
 * `projects` — только активные, в порядке position; мутации оптимистичные с откатом.
 */
export function useProjects() {
  const [all, setAll] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const allRef = useRef(all)
  allRef.current = all

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      setAll((await listProjects(todayStr(), true)).sort(byPosition))
      setError(null)
    } catch (e) {
      if (!silent) setError(errorText(e, 'не удалось загрузить списки'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    load(true)
  }, [load])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeChanges(refresh), [refresh])

  const run = useCallback(
    async <T,>(optimistic: ((p: Project[]) => Project[]) | null, action: () => Promise<T>) => {
      const snapshot = allRef.current
      if (optimistic) setAll(optimistic(snapshot))
      try {
        const res = await action()
        notifyChanged(refresh)
        return res
      } catch (e) {
        setAll(snapshot)
        setActionError(errorText(e))
        return null
      }
    },
    [refresh],
  )

  const create = useCallback(
    async (name: string, color: string) => {
      const created = await run(null, () => createProject(name, color))
      if (created) setAll((prev) => [...prev, { ...created, counts: { active: 0, overdue: 0 } }])
      return created
    },
    [run],
  )

  const update = useCallback(
    (id: number, patch: ProjectPatch) =>
      run(
        (prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        () => patchProject(id, patch),
      ),
    [run],
  )

  const remove = useCallback(
    (id: number) => run((prev) => prev.filter((p) => p.id !== id), () => deleteProject(id).then(() => true)),
    [run],
  )

  /** Новый порядок активных списков; архивные остаются в хвосте. */
  const reorder = useCallback(
    (ids: number[]) => {
      const current = allRef.current.filter((p) => !p.archived).map((p) => p.id)
      if (ids.every((id, i) => id === current[i])) return Promise.resolve(null)
      const pos = new Map(ids.map((id, i) => [id, i]))
      return run(
        (prev) => prev.map((p) => ({ ...p, position: pos.get(p.id) ?? p.position })).sort(byPosition),
        () => reorderProjects(ids).then(() => true),
      )
    },
    [run],
  )

  return {
    projects: all.filter((p) => !p.archived),
    archived: all.filter((p) => p.archived),
    all,
    loading,
    error,
    actionError,
    clearActionError: () => setActionError(null),
    reload: load,
    create,
    update,
    remove,
    reorder,
  }
}
