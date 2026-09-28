import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { errorText } from '../api/client'
import {
  createProject,
  deleteProject,
  listProjects,
  patchProject,
} from '../api/projects'
import type { Project, ProjectPatch } from '../api/types'
import { todayStr } from '../lib/date'
import { useCached } from './useCached'

function byPosition(a: Project, b: Project): number {
  return a.position - b.position || a.id - b.id
}

const NO_PROJECTS: Project[] = []

/**
 * Все списки вместе с архивными (архив нужен, чтобы список можно было вернуть) — из общего кэша.
 * `projects` — только активные, в порядке position; мутации оптимистичные с откатом.
 * Списки меняются редко, поэтому от изменений задач хук не перечитывается. Исключение — `withCounts`
 * (экран «Списки» показывает у списков счётчики задач): тогда перечитывается при каждом показе и от задач.
 */
export function useProjects({ withCounts = false }: { withCounts?: boolean } = {}) {
  const c = useCached<Project[]>(
    'projects',
    async () => (await listProjects(todayStr(), true)).sort(byPosition),
    { topics: withCounts ? ['projects', 'tasks'] : ['projects'], always: withCounts, errorText: 'не удалось загрузить списки' },
  )
  const { set: setAll, notify } = c
  const all = c.data ?? NO_PROJECTS
  const [actionError, setActionError] = useState<string | null>(null)
  const allRef = useRef(all)
  useLayoutEffect(() => {
    allRef.current = all
  })

  const run = useCallback(
    async <T,>(optimistic: ((p: Project[]) => Project[]) | null, action: () => Promise<T>) => {
      const snapshot = allRef.current
      if (optimistic) setAll(optimistic(snapshot))
      try {
        const res = await action()
        // удалённый список уносит задачи во «Входящие» — задачи тоже меняются
        notify(['projects', 'tasks'])
        return res
      } catch (e) {
        setAll(snapshot)
        setActionError(errorText(e))
        return null
      }
    },
    [setAll, notify],
  )

  const create = useCallback(
    async (name: string, color: string) => {
      const created = await run(null, () => createProject(name, color))
      if (created) setAll((prev = []) => [...prev, { ...created, counts: { active: 0, overdue: 0 } }])
      return created
    },
    [run, setAll],
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

  return {
    projects: all.filter((p) => !p.archived),
    archived: all.filter((p) => p.archived),
    all,
    loading: c.loading,
    error: c.error,
    actionError,
    clearActionError: () => setActionError(null),
    reload: c.reload,
    create,
    update,
    remove,
  }
}
