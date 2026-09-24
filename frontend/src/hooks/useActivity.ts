import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../api/client'
import { getActivity } from '../api/day'
import { todayStr } from '../lib/date'
import { subscribeChanges } from '../lib/sync'

/** Выполнено по дням: ключ — "YYYY-MM-DD". */
export type DayCounts = Map<string, number>

// Статистика грида («всего», «макс. серия») — за всё время, поэтому from с запасом:
// ответ разреженный, лишние годы ничего не стоят.
const ACTIVITY_FROM = '2000-01-01'

export interface Activity {
  counts: DayCounts
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Грид активности из GET /stats/activity. Дни считает сервер в APP_TZ, а не устройство.
 * После любой мутации тихо перечитывается — выполненная задача сразу даёт квадратик.
 */
export function useActivity(): Activity {
  const [counts, setCounts] = useState<DayCounts>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCounts = useCallback(async () => {
    const days = await getActivity(ACTIVITY_FROM, todayStr())
    setCounts(new Map(days.map((d) => [d.date, d.done])))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await fetchCounts()
    } catch (e) {
      setError(errorText(e, 'не удалось загрузить активность'))
    } finally {
      setLoading(false)
    }
  }, [fetchCounts])

  const refresh = useCallback(async () => {
    try {
      await fetchCounts()
    } catch {
      /* оставляем то, что уже на экране */
    }
  }, [fetchCounts])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeChanges(refresh), [refresh])

  return { counts, loading, error, reload: load }
}
