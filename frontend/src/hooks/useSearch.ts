import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../api/client'
import { listTasks, patchTask } from '../api/tasks'
import type { Task, TaskPatch } from '../api/types'
import { todayStr } from '../lib/date'
import { notifyChanged, subscribeChanges } from '../lib/sync'

const DONE_LIMIT = 30
const DEBOUNCE_MS = 250

export type SearchResult = { active: Task[]; done: Task[]; doneTotal: number }

/**
 * Поиск по заголовку и заметке: активные (все, в ручном порядке) и выполненные (свежие сверху, до 30).
 * Запрос уходит через 250 мс после последней буквы; ответы на устаревший запрос отбрасываются.
 */
export function useSearch(query: string) {
  const q = query.trim()
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const run = useCallback(async (text: string) => {
    const req = ++reqRef.current
    if (!text) {
      setResult(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const today = todayStr()
      const [active, done] = await Promise.all([
        listTasks({ view: 'all', today, q: text }),
        listTasks({ view: 'archive', today, q: text, sort: 'done_at', order: 'desc', limit: DONE_LIMIT }),
      ])
      if (req !== reqRef.current) return
      setResult({ active: active.items, done: done.items, doneTotal: done.total })
      setError(null)
    } catch (e) {
      if (req === reqRef.current) setError(errorText(e, 'поиск не удался'))
    } finally {
      if (req === reqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => run(q), q ? DEBOUNCE_MS : 0)
    return () => clearTimeout(t)
  }, [q, run])

  const refresh = useCallback(() => run(q), [q, run])
  useEffect(() => subscribeChanges(refresh), [refresh])

  /** Правка прямо из результатов (выполнить / вернуть, дедлайн); результаты перечитываются по шине. */
  const update = useCallback(async (id: number, patch: TaskPatch) => {
    try {
      await patchTask(id, patch)
      notifyChanged()
    } catch (e) {
      setError(errorText(e))
    }
  }, [])

  return { q, result, loading, error, update }
}
