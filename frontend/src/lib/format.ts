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

/** A task is "на сегодня" when its daily_date (if any) falls on the current day. */
export function isDailyTask(task: Task): boolean {
  return isToday(task.daily_date)
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
