import { useCallback, useEffect, useState } from 'react'
import { getTodos } from '../api'
import { localDayOf } from '../lib/format'

/** Per-day completion counts keyed by local YYYY-MM-DD. */
export type DayCounts = Map<string, number>

export interface Activity {
  counts: DayCounts
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Fetches every completed task (independent of the list view's filters) and buckets
 * them by the local calendar day of `done_at`. One fetch per mount / manual reload —
 * the contribution grid derives everything else during render.
 */
export function useActivity(active: boolean): Activity {
  const [counts, setCounts] = useState<DayCounts>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getTodos({ done: 'true' })
      const next: DayCounts = new Map()
      for (const task of data.items ?? []) {
        const key = localDayOf(task.done_at)
        if (key) next.set(key, (next.get(key) ?? 0) + 1)
      }
      setCounts(next)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить активность')
    } finally {
      setLoading(false)
    }
  }, [])

  // fetch only while the view is open; refetch each time it reopens so counts stay fresh
  useEffect(() => {
    if (active) load()
  }, [active, load])

  return { counts, loading, error, reload: load }
}
