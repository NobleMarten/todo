import { request } from './client'
import type { DateStr, ListResponse, NewTask, ReorderScope, Task, TaskPatch, View } from './types'

export type ListParams = {
  view: View
  today: DateStr
  project_id?: number
  done?: boolean // переопределяет условие вьюхи: inbox + done=true — выполненные входящие
  from?: DateStr
  to?: DateStr
  sort?: 'position' | 'due_date' | 'priority' | 'created_at' | 'done_at'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export async function listTasks(params: ListParams): Promise<ListResponse<Task>> {
  const data = await request<ListResponse<Task> | null>('GET', '/tasks', { query: params })
  return { items: data?.items ?? [], total: data?.total ?? 0 }
}

/** Задача вместе с подзадачами. */
export function getTask(id: number): Promise<Task> {
  return request<Task>('GET', `/tasks/${id}`)
}

export function createTask(t: NewTask): Promise<Task> {
  return request<Task>('POST', '/tasks', { body: t })
}

export function patchTask(id: number, p: TaskPatch): Promise<Task> {
  return request<Task>('PATCH', `/tasks/${id}`, { body: p })
}

export function deleteTask(id: number): Promise<void> {
  return request<void>('DELETE', `/tasks/${id}`)
}

export function reorderTasks(scope: ReorderScope, ids: number[]): Promise<void> {
  return request<void>('POST', '/tasks/reorder', { body: { scope, ids } })
}
