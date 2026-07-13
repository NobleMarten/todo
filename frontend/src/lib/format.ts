import type { Task } from '../api'

export function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

export function isToday(iso?: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/** Local calendar date as YYYY-MM-DD. */
export function todayKey(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * A task is "на сегодня" when its daily_date is the current calendar day.
 * daily_date is a DATE the backend serializes at UTC midnight ("2026-07-13T00:00:00Z"),
 * so we compare the leading date portion directly instead of parsing through Date() —
 * that avoids the timezone shift that would drop a day for viewers behind UTC.
 */
export function isDailyTask(task: Task): boolean {
  const d = task.daily_date
  if (!d) return false
  return d.slice(0, 10) === todayKey()
}

export const PRIORITY_WEIGHT: Record<string, number> = { high: 1, medium: 2, low: 3 }

export function priorityWeight(p?: string): number {
  return PRIORITY_WEIGHT[p ?? 'low'] ?? 3
}

export const PRIORITY_LABEL: Record<string, string> = {
  high: 'срочно',
  medium: 'важно',
  low: 'обычно',
}

export type Priority = 'high' | 'medium' | 'low'

export function nextPriority(p?: string): Priority {
  return p === 'high' ? 'medium' : p === 'medium' ? 'low' : 'high'
}

/** Sort a copy of tasks by the given field (client-side source of truth). */
export function sortTasks(tasks: Task[], sort: '' | 'created_at' | 'priority'): Task[] {
  if (!sort) return tasks
  const copy = [...tasks]
  if (sort === 'priority') {
    copy.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority))
  } else if (sort === 'created_at') {
    copy.sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    )
  }
  return copy
}
