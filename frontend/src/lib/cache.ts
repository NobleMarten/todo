import type { Task } from '../api/types'
import type { Topic } from './sync'

// Кэш данных экранов (stale-while-revalidate). Экран, на который вернулись, сразу рисует то,
// что уже было загружено, а свежее подтягивает в фоне; скелетон — только когда данных нет совсем.
// Ключ — что именно загружено: 'day:2026-09-28', 'tasks:project:3:2026-09-28', 'task:12', 'projects'…
// Все экземпляры хука с одним ключом видят одни данные: оптимистичная правка в одном месте
// сразу видна в другом.

interface Entry {
  data: unknown
  has: boolean
  at: number // когда данные пришли с сервера; 0 — не приходили (подсказка из строки, хранилище)
  stale: boolean // данные могли устареть (была мутация) — при следующем показе перечитать
  writes: number // счётчик локальных записей
  inflight: { promise: Promise<unknown>; writes: number } | null
}

/** Новое значение или функция от прежнего; функция вернула undefined — ничего не меняем. */
export type Updater<T> = T | ((prev: T | undefined) => T | undefined)

/** Какие ключи устаревают от изменения темы. Счётчики списков в 'projects' экран «Списки» перечитывает сам. */
export function staleKeys(topics: Topic[]): (key: string) => boolean {
  const tasks = topics.includes('tasks')
  const projects = topics.includes('projects')
  return (key) => (key === 'projects' ? projects : tasks)
}

/**
 * Заменить задачу по id везде внутри значения (списки, блоки дня, недели, подзадачи) ответом сервера.
 * Подзадачи и счётчик подзадач остаются от старой версии: в ответе PATCH их нет.
 * Неизменённые части возвращаются теми же ссылками.
 */
export function replaceTask<T>(value: T, saved: Task): T {
  if (Array.isArray(value)) {
    let changed = false
    const out = value.map((v) => {
      const n = replaceTask(v, saved)
      if (n !== v) changed = true
      return n
    })
    return (changed ? out : value) as T
  }
  if (value === null || typeof value !== 'object' || value instanceof Map) return value
  const o = value as Record<string, unknown>
  if (o.id === saved.id && typeof o.title === 'string' && 'priority' in o) {
    const next: Record<string, unknown> = { ...o, ...saved }
    if ('subtasks' in o) next.subtasks = o.subtasks
    else delete next.subtasks
    if ('subtask_stats' in o) next.subtask_stats = o.subtask_stats
    return next as T
  }
  let changed = false
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    const n = replaceTask(v, saved)
    out[k] = n
    if (n !== v) changed = true
  }
  return (changed ? out : value) as T
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
}

/**
 * Ответ сервера с переиспользованием того, что не изменилось (structural sharing): равные по значению
 * объекты и массивы остаются прежними ссылками. Строки списков — memo, и фоновое перечитывание
 * перерисовывает только изменённые задачи; если не изменилось ничего, возвращается prev целиком.
 * Элементы массивов с id сопоставляются по id (задачу вставили выше — остальные всё равно узнаются).
 */
export function shareEqual<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T
  if (Array.isArray(prev) && Array.isArray(next)) {
    const byId = new Map<unknown, unknown>()
    for (const p of prev) if (isPlain(p) && 'id' in p) byId.set(p.id, p)
    let same = prev.length === next.length
    const out = next.map((v, i) => {
      const old = isPlain(v) && 'id' in v && byId.has(v.id) ? byId.get(v.id) : prev[i]
      const n = shareEqual(old, v)
      if (n !== prev[i]) same = false
      return n
    })
    return (same ? prev : out) as T
  }
  if (isPlain(prev) && isPlain(next)) {
    const keys = Object.keys(next)
    let same = keys.length === Object.keys(prev).length
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const n = shareEqual(prev[k], next[k])
      out[k] = n
      if (n !== prev[k] || !(k in prev)) same = false
    }
    return (same ? prev : out) as T
  }
  return next
}

export function createCache(now: () => number = Date.now) {
  const entries = new Map<string, Entry>()
  const listeners = new Map<string, Set<() => void>>()
  const anyListeners = new Set<() => void>()

  const entry = (key: string): Entry => {
    let e = entries.get(key)
    if (!e) {
      e = { data: undefined, has: false, at: 0, stale: false, writes: 0, inflight: null }
      entries.set(key, e)
    }
    return e
  }
  const emit = (key: string) => {
    listeners.get(key)?.forEach((fn) => fn())
    anyListeners.forEach((fn) => fn())
  }

  return {
    get<T>(key: string): T | undefined {
      return entries.get(key)?.data as T | undefined
    },

    /** Локальная запись (оптимистичная правка, откат, ответ мутации). Свежести не прибавляет. */
    set<T>(key: string, next: Updater<T>): void {
      const e = entry(key)
      const value =
        typeof next === 'function' ? (next as (p: T | undefined) => T | undefined)(e.data as T | undefined) : next
      if (value === undefined) return
      e.data = value
      e.has = true
      e.writes++
      emit(key)
    },

    /** Подсказка, пока настоящих данных нет (задача из строки списка для карточки): показать сразу, но перечитать. */
    prime<T>(key: string, data: T): void {
      const e = entry(key)
      if (e.has) return
      e.data = data
      e.has = true
      e.stale = true
      emit(key)
    },

    /** Надо ли перечитать: данных нет, их пометили устаревшими или они старше maxAge. */
    isStale(key: string, maxAge: number): boolean {
      const e = entries.get(key)
      return !e || !e.has || e.stale || now() - e.at > maxAge
    },

    /**
     * Загрузить ключ. Одинаковые запросы в полёте схлопываются. Ответ на запрос, начатый до локальной
     * записи, не затирает её (иначе оптимистичная правка мигнёт назад) — после мутации хук перечитывает сам.
     */
    fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
      const e = entry(key)
      if (e.inflight && e.inflight.writes === e.writes) return e.inflight.promise as Promise<T>
      const writes = e.writes
      const promise = fetcher()
        .then((data) => {
          if (e.writes === writes) {
            const shared = e.has ? shareEqual(e.data, data) : data
            const changed = !e.has || shared !== e.data
            e.data = shared
            e.has = true
            e.at = now()
            e.stale = false
            if (changed) emit(key)
          }
          return data
        })
        .finally(() => {
          if (e.inflight?.promise === promise) e.inflight = null
        })
      e.inflight = { promise, writes }
      return promise
    },

    invalidate(match: (key: string) => boolean): void {
      for (const [k, e] of entries) if (match(k)) e.stale = true
    },

    /** Ответ PATCH — во все загруженные экраны сразу, не дожидаясь их перечитывания. */
    patchTask(saved: Task): void {
      for (const [k, e] of entries) {
        if (!e.has) continue
        const next = replaceTask(e.data, saved)
        if (next === e.data) continue
        e.data = next
        e.writes++
        emit(k)
      }
    },

    subscribe(key: string, fn: () => void): () => void {
      let set = listeners.get(key)
      if (!set) listeners.set(key, (set = new Set()))
      set.add(fn)
      return () => {
        set.delete(fn)
      }
    },

    subscribeAll(fn: () => void): () => void {
      anyListeners.add(fn)
      return () => {
        anyListeners.delete(fn)
      }
    },

    clear(): void {
      const keys = [...entries.keys()]
      entries.clear()
      keys.forEach(emit)
    },

    /** Снимок для хранилища: только загруженные ключи, подходящие под фильтр. */
    dump(match: (key: string) => boolean): Record<string, unknown> {
      const out: Record<string, unknown> = {}
      for (const [k, e] of entries) if (e.has && match(k)) out[k] = e.data
      return out
    },

    /** Из хранилища: показать сразу, но считать устаревшим. Уже загруженное не трогаем. */
    restore(snapshot: Record<string, unknown>): void {
      for (const [k, data] of Object.entries(snapshot)) {
        const e = entry(k)
        if (e.has) continue
        e.data = data
        e.has = true
        e.stale = true
      }
    },
  }
}

export type Cache = ReturnType<typeof createCache>

/** Общий кэш приложения. */
export const cache = createCache()
