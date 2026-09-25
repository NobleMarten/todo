import type { Task } from '../api/types'

// Задачи, удалённые «с отменой»: на сервере они ещё есть, но на экран попадать не должны.
// Фильтр стоит в api/*, поэтому фоновые перечитывания (шина lib/sync) их не возвращают.
// Отдельный модуль без импортов из api/ — чтобы api/tasks и lib/pendingDelete не зависели друг от друга по кругу.
const hidden = new Set<number>()

export function hide(id: number): void {
  hidden.add(id)
}

export function unhide(id: number): void {
  hidden.delete(id)
}

export function isHidden(id: number): boolean {
  return hidden.has(id)
}

/** Без скрытых задач и без скрытых подзадач внутри. */
export function visible(tasks: Task[]): Task[] {
  if (hidden.size === 0) return tasks
  return tasks
    .filter((t) => !hidden.has(t.id))
    .map((t) => (t.subtasks ? { ...t, subtasks: t.subtasks.filter((s) => !hidden.has(s.id)) } : t))
}
