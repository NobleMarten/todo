import { getStatsSummary } from '../api/day'
import type { StatsSummary } from '../api/types'
import { todayStr } from '../lib/date'
import { periodRange, type Period } from '../lib/stats'
import { useCached } from './useCached'

/**
 * Итоги периода из GET /stats/summary, из общего кэша: ключ по периоду и дню, так что переключение
 * периодов туда-обратно рисуется сразу. После мутаций задач тихо перечитывается, как грид активности.
 */
export function useStats(period: Period) {
  const today = todayStr()
  const { from, to } = periodRange(period, today)
  const c = useCached<StatsSummary>(`stats:${period}:${today}`, () => getStatsSummary(from, to), {
    errorText: 'не удалось загрузить статистику',
  })
  return { data: c.data, loading: c.loading, error: c.error, reload: c.reload }
}
