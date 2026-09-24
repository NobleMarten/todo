import { request } from './client'
import type { DateStr, Project, ProjectPatch } from './types'

/** Списки со счётчиками. archived=true — вместе с архивными. */
export async function listProjects(today: DateStr, archived = false): Promise<Project[]> {
  const data = await request<Project[] | null>('GET', '/projects', {
    query: { today, archived: archived || undefined },
  })
  return data ?? []
}

export function createProject(name: string, color: string): Promise<Project> {
  return request<Project>('POST', '/projects', { body: { name, color } })
}

export function patchProject(id: number, p: ProjectPatch): Promise<Project> {
  return request<Project>('PATCH', `/projects/${id}`, { body: p })
}

/** Задачи удалённого списка уходят во «Входящие». */
export function deleteProject(id: number): Promise<void> {
  return request<void>('DELETE', `/projects/${id}`)
}

export function reorderProjects(ids: number[]): Promise<void> {
  return request<void>('POST', '/projects/reorder', { body: { ids } })
}
