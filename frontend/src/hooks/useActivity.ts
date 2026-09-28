import { useMemo } from 'react'
import { getActivity } from '../api/day'
import { todayStr } from '../lib/date'
import type { DayCount } from '../api/types'
import { useCached } from './useCached'

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
 * Грид активности из GET /stats/activity, из общего кэша. Дни считает сервер в APP_TZ, а не устройство.
 * После любой мутации задач тихо перечитывается — выполненная задача сразу даёт квадратик.
 */
export function useActivity(): Activity {
  const c = useCached<DayCount[]>('activity', () => getActivity(ACTIVITY_FROM, todayStr()), {
    errorText: 'не удалось загрузить активность',
  })
  const days = c.data
  const counts = useMemo(() => new Map((days ?? []).map((d) => [d.date, d.done])), [days])
  return { counts, loading: c.loading, error: c.error, reload: c.reload }
}
