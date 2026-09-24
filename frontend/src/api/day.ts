import { request } from './client'
import type { DateStr, Day, DayCount, Suggestions, Task } from './types'

/** Экран «Сегодня»: план, просроченное, недоделанное и выполненное за день. */
export async function getDay(date: DateStr): Promise<Day> {
  const d = await request<Day>('GET', '/day', { query: { date } })
  const list = (xs: Task[] | null | undefined) => xs ?? []
  return {
    ...d,
    planned: list(d.planned),
    overdue: list(d.overdue),
    carry_over: list(d.carry_over),
    done_today: list(d.done_today),
  }
}

/** Материал для «Собрать день». */
export async function getSuggestions(date: DateStr): Promise<Suggestions> {
  const s = await request<Suggestions>('GET', '/day/suggestions', { query: { date } })
  return { overdue: s.overdue ?? [], due_soon: s.due_soon ?? [], stale: s.stale ?? [] }
}

/** Добавить задачи в план дня и/или убрать из него (scheduled_for = date / null). */
export function planDay(date: DateStr, add: number[], remove: number[] = []): Promise<void> {
  return request<void>('POST', '/day/plan', { body: { date, add, remove } })
}

/** Выполнено по дням (разреженно: дни без выполненных не приходят). */
export async function getActivity(from: DateStr, to: DateStr): Promise<DayCount[]> {
  return (await request<DayCount[] | null>('GET', '/stats/activity', { query: { from, to } })) ?? []
}
