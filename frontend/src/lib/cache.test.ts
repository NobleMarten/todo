import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../api/types'
import { createCache, replaceTask, shareEqual, staleKeys } from './cache'
import { forgetCache, persistable, persistCache, restoreCache, type StorageLike } from './cachePersist'

function task(id: number, over: Partial<Task> = {}): Task {
  return {
    id,
    title: `задача ${id}`,
    done: false,
    priority: 'medium',
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
    ...over,
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createCache', () => {
  it('отдаёт загруженное и считает свежим до maxAge', async () => {
    let t = 1000
    const c = createCache(() => t)
    expect(c.isStale('a', 30_000)).toBe(true)
    await c.fetch('a', async () => [1, 2])
    expect(c.get('a')).toEqual([1, 2])
    expect(c.isStale('a', 30_000)).toBe(false)
    t += 30_001
    expect(c.isStale('a', 30_000)).toBe(true)
  })

  it('схлопывает одинаковые запросы в полёте', async () => {
    const c = createCache()
    const d = deferred<number>()
    const fetcher = vi.fn(() => d.promise)
    const p1 = c.fetch('a', fetcher)
    const p2 = c.fetch('a', fetcher)
    d.resolve(5)
    expect(await p1).toBe(5)
    expect(await p2).toBe(5)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('ответ на запрос, начатый до локальной записи, её не затирает', async () => {
    const c = createCache()
    const d = deferred<string>()
    const old = c.fetch('a', () => d.promise)
    c.set('a', 'оптимистично')
    d.resolve('старое с сервера')
    await old
    expect(c.get('a')).toBe('оптимистично')
    // а новый запрос после записи не переиспользует старый и применяется
    await c.fetch('a', async () => 'свежее')
    expect(c.get('a')).toBe('свежее')
  })

  it('ошибка загрузки не трогает данные и снимает запрос из полёта', async () => {
    const c = createCache()
    c.set('a', 1)
    await expect(c.fetch('a', async () => Promise.reject(new Error('сеть')))).rejects.toThrow('сеть')
    expect(c.get('a')).toBe(1)
    const fetcher = vi.fn(async () => 2)
    await c.fetch('a', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('prime показывает подсказку, но оставляет ключ устаревшим; настоящее не перетирает', async () => {
    const c = createCache()
    c.prime('task:1', task(1))
    expect(c.get<Task>('task:1')?.id).toBe(1)
    expect(c.isStale('task:1', Infinity)).toBe(true)
    await c.fetch('task:1', async () => task(1, { title: 'с сервера' }))
    c.prime('task:1', task(1))
    expect(c.get<Task>('task:1')?.title).toBe('с сервера')
  })

  it('invalidate по темам: задачи не трогают списки, списки — задачи', async () => {
    const c = createCache()
    await c.fetch('projects', async () => [])
    await c.fetch('day:2026-09-28', async () => ({}))
    c.invalidate(staleKeys(['tasks']))
    expect(c.isStale('projects', Infinity)).toBe(false)
    expect(c.isStale('day:2026-09-28', Infinity)).toBe(true)
    await c.fetch('day:2026-09-28', async () => ({}))
    c.invalidate(staleKeys(['projects']))
    expect(c.isStale('projects', Infinity)).toBe(true)
    expect(c.isStale('day:2026-09-28', Infinity)).toBe(false)
  })

  it('patchTask меняет задачу во всех ключах и оповещает только изменённые', async () => {
    const c = createCache()
    c.set('tasks:all', [task(1), task(2)])
    c.set('task:3', task(3))
    const onAll = vi.fn()
    const onOne = vi.fn()
    c.subscribe('tasks:all', onAll)
    c.subscribe('task:3', onOne)
    c.patchTask(task(2, { title: 'новый' }))
    expect(c.get<Task[]>('tasks:all')?.[1].title).toBe('новый')
    expect(onAll).toHaveBeenCalledTimes(1)
    expect(onOne).not.toHaveBeenCalled()
  })
})

describe('shareEqual', () => {
  it('равный ответ — прежний объект целиком', () => {
    const prev = { date: 'x', planned: [task(1), task(2)] }
    const next = JSON.parse(JSON.stringify(prev))
    expect(shareEqual(prev, next)).toBe(prev)
  })

  it('изменённая задача — новая, остальные — прежние ссылки, даже если сдвинулись', () => {
    const prev = [task(1), task(2), task(3)]
    const next = [task(9), task(1), task(2, { title: 'правка' }), task(3)]
    const out = shareEqual(prev, next)
    expect(out).not.toBe(prev)
    expect(out[1]).toBe(prev[0])
    expect(out[2]).not.toBe(prev[1])
    expect(out[2].title).toBe('правка')
    expect(out[3]).toBe(prev[2])
  })

  it('убранное поле и укороченный массив — изменение', () => {
    expect(shareEqual({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 })
    const prev = [1, 2]
    expect(shareEqual(prev, [1])).toEqual([1])
  })

  it('перечитывание без изменений не оповещает подписчиков', async () => {
    const c = createCache()
    await c.fetch('a', async () => [task(1)])
    const fn = vi.fn()
    c.subscribe('a', fn)
    await c.fetch('a', async () => [task(1)])
    expect(fn).not.toHaveBeenCalled()
    await c.fetch('a', async () => [task(1, { done: true })])
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('replaceTask', () => {
  it('находит задачу в блоках дня и сохраняет счётчик подзадач', () => {
    const day = { date: 'x', planned: [task(1, { subtask_stats: { done: 1, total: 2 } })], overdue: [task(2)] }
    const next = replaceTask(day, task(1, { title: 'правка', done: true }))
    expect(next.planned[0].title).toBe('правка')
    expect(next.planned[0].subtask_stats).toEqual({ done: 1, total: 2 })
    expect(next.overdue).toBe(day.overdue) // нетронутое — та же ссылка
  })

  it('меняет подзадачу внутри задачи, подзадачи родителя не теряются', () => {
    const parent = task(1, { subtasks: [task(5, { parent_id: 1 }), task(6, { parent_id: 1 })] })
    const next = replaceTask(parent, task(5, { parent_id: 1, done: true }))
    expect(next.subtasks?.[0].done).toBe(true)
    const again = replaceTask(next, task(1, { title: 'родитель' }))
    expect(again.subtasks).toHaveLength(2)
    expect(again.title).toBe('родитель')
  })

  it('без совпадений возвращает то же значение', () => {
    const v = { items: [task(1)], total: 1 }
    expect(replaceTask(v, task(9))).toBe(v)
  })
})

describe('кэш в хранилище', () => {
  const today = '2026-09-28'

  it('persistable: только сегодняшнее и текущая неделя', () => {
    expect(persistable('projects', today)).toBe(true)
    expect(persistable('day:2026-09-28', today)).toBe(true)
    expect(persistable('day:2026-09-27', today)).toBe(false)
    expect(persistable('tasks:project:3:2026-09-28', today)).toBe(true)
    expect(persistable('counts:2026-09-28', today)).toBe(true)
    expect(persistable('week:2026-09-28', today)).toBe(true)
    expect(persistable('week:2026-09-22', today)).toBe(true)
    expect(persistable('week:2026-09-21', today)).toBe(false)
    expect(persistable('week:2026-10-05', today)).toBe(false)
    expect(persistable('task:5', today)).toBe(false)
    expect(persistable('archive:all', today)).toBe(false)
  })

  function memStorage(): StorageLike & { data: Map<string, string> } {
    const data = new Map<string, string>()
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }
  }

  it('сохраняет, восстанавливает устаревшим и забывает при выходе', async () => {
    vi.useFakeTimers()
    try {
      const storage = memStorage()
      const a = createCache()
      const stop = persistCache(a, storage, () => today, 10)
      await a.fetch('day:2026-09-28', async () => ({ planned: [1] }))
      a.set('task:1', task(1))
      a.set('day:2026-09-20', { old: true })
      vi.advanceTimersByTime(20)
      stop()

      const b = createCache()
      restoreCache(b, storage, today)
      expect(b.get('day:2026-09-28')).toEqual({ planned: [1] })
      expect(b.isStale('day:2026-09-28', Infinity)).toBe(true)
      expect(b.get('task:1')).toBeUndefined()
      expect(b.get('day:2026-09-20')).toBeUndefined()

      forgetCache(b, storage)
      expect(b.get('day:2026-09-28')).toBeUndefined()
      expect(storage.data.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('битый снимок не ломает запуск', () => {
    const storage = memStorage()
    storage.setItem('todo:cache:v1', '{не json')
    const c = createCache()
    restoreCache(c, storage, today)
    expect(c.get('projects')).toBeUndefined()
  })
})
