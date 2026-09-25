import { visible } from '../lib/deleting'
import { request } from './client'
import type { DateStr, Day, DayCount, Suggestions, Task, Week } from './types'

/** Экран «Сегодня»: план, просроченное, недоделанное и выполненное за день. */
export async function getDay(date: DateStr): Promise<Day> {
  const d = await request<Day>('GET', '/day', { query: { date } })
  const list = (xs: Task[] | null | undefined) => visible(xs ?? [])
  return {
    ...d,
    planned: list(d.planned),
    overdue: list(d.overdue),
    carry_over: list(d.carry_over),
    done_today: list(d.done_today),
  }
}

/** Неделя с from (понедельник по локальной дате): дни, дедлайны после недели и бэклог. */
export async function getWeek(from: DateStr): Promise<Week> {
  const w = await request<Week>('GET', '/day/week', { query: { from } })
  const list = (xs: Task[] | null | undefined) => visible(xs ?? [])
  const backlog = list(w.backlog)
  return {
    ...w,
    days: (w.days ?? []).map((d) => ({
      date: d.date,
      scheduled: list(d.scheduled),
      deadlines: list(d.deadlines),
      done: list(d.done),
    })),
    upcoming: list(w.upcoming),
    backlog,
    backlog_total: Math.max(0, w.backlog_total - ((w.backlog ?? []).length - backlog.length)),
  }
}

/** Материал для «Собрать день». */
export async function getSuggestions(date: DateStr): Promise<Suggestions> {
  const s = await request<Suggestions>('GET', '/day/suggestions', { query: { date } })
  return { overdue: visible(s.overdue ?? []), due_soon: visible(s.due_soon ?? []), stale: visible(s.stale ?? []) }
}

/** Добавить задачи в план дня и/или убрать из него (scheduled_for = date / null). */
export function planDay(date: DateStr, add: number[], remove: number[] = []): Promise<void> {
  return request<void>('POST', '/day/plan', { body: { date, add, remove } })
}

/** Выполнено по дням (разреженно: дни без выполненных не приходят). */
export async function getActivity(from: DateStr, to: DateStr): Promise<DayCount[]> {
  return (await request<DayCount[] | null>('GET', '/stats/activity', { query: { from, to } })) ?? []
}
