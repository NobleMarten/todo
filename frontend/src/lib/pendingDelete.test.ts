import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../api/types'
import { isHidden, visible } from './deleting'
import { flushDelete, scheduleDelete, subscribePending, undoDelete, UNDO_MS, type PendingState } from './pendingDelete'
import { subscribeChanges } from './sync'

const task = (id: number): Task => ({
  id,
  title: `t${id}`,
  done: false,
  priority: 'low',
  project_id: null,
  parent_id: null,
  due_date: null,
  scheduled_for: null,
  position: id,
  note: null,
  repeat: null,
  created_at: '',
  done_at: null,
  updated_at: '',
})

let fetchMock: ReturnType<typeof vi.fn>
let states: PendingState[]
let changes: number
let unsub: (() => void)[]

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  states = []
  changes = 0
  unsub = [subscribePending((s) => states.push(s)), subscribeChanges(() => changes++)]
})

afterEach(async () => {
  undoDelete() // модуль глобальный — не тащим состояние в следующий тест
  unsub.forEach((f) => f())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url)

describe('pendingDelete', () => {
  it('прячет сразу, удаляет через UNDO_MS', async () => {
    scheduleDelete(7, 'купить молоко')
    expect(isHidden(7)).toBe(true)
    expect(visible([task(6), task(7)]).map((t) => t.id)).toEqual([6])
    expect(states.at(-1)).toEqual({ kind: 'pending', id: 7, title: 'купить молоко' })

    await vi.advanceTimersByTimeAsync(UNDO_MS - 1)
    expect(deletes()).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(deletes()).toEqual(['/tasks/7'])
    expect(isHidden(7)).toBe(false)
    expect(states.at(-1)).toBeNull()
    expect(changes).toBe(1) // экраны перечитались после удаления
  })

  it('«вернуть» — запроса нет, задача снова видна, экраны перечитываются', async () => {
    scheduleDelete(7, 'x')
    undoDelete()
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2)

    expect(deletes()).toEqual([])
    expect(isHidden(7)).toBe(false)
    expect(states.at(-1)).toBeNull()
    expect(changes).toBe(1)
  })

  it('второе удаление сразу проводит первое', async () => {
    scheduleDelete(1, 'a')
    scheduleDelete(2, 'b')
    await vi.advanceTimersByTimeAsync(0)

    expect(deletes()).toEqual(['/tasks/1'])
    expect(isHidden(2)).toBe(true)
    expect(states.at(-1)).toEqual({ kind: 'pending', id: 2, title: 'b' })

    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(deletes()).toEqual(['/tasks/1', '/tasks/2'])
  })

  it('flushDelete — сейчас, без ожидания', async () => {
    scheduleDelete(3, 'c')
    await flushDelete()
    expect(deletes()).toEqual(['/tasks/3'])
  })

  it('ошибка сервера — задача возвращается, показывается ошибка', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 500 }))
    scheduleDelete(4, 'd')
    await flushDelete()

    expect(isHidden(4)).toBe(false)
    expect(states.at(-1)).toMatchObject({ kind: 'error' })
    expect((states.at(-1) as { message: string }).message).toContain('«d»')
    expect(changes).toBe(1)
  })

  it('404 — уже удалена (каскадом), это успех', async () => {
    fetchMock.mockImplementation(async () => Response.json({ code: 'TASK_NOT_FOUND', message: '' }, { status: 404 }))
    scheduleDelete(5, 'e')
    await flushDelete()

    expect(isHidden(5)).toBe(false)
    expect(states.at(-1)).toBeNull()
  })

  it('visible прячет и подзадачи', () => {
    scheduleDelete(9, 'sub')
    const parent = { ...task(1), subtasks: [task(8), task(9)] }
    expect(visible([parent])[0].subtasks?.map((t) => t.id)).toEqual([8])
  })
})
