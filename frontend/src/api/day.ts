import { request } from './client'
import type { DateStr } from './types'

/** Добавить задачи в план дня и/или убрать из него (scheduled_for = date / null). */
export function planDay(date: DateStr, add: number[], remove: number[] = []): Promise<void> {
  return request<void>('POST', '/day/plan', { body: { date, add, remove } })
}
