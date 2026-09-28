import type { DateStr } from '../api/types'
import { addDays } from './date'
import type { Cache } from './cache'

// Кэш экранов переживает перезапуск PWA: холодный старт сразу рисует прошлое состояние,
// свежее приходит в фоне. Храним только сегодняшнее: день, списки, неделю, счётчики и сами списки.

const STORAGE_KEY = 'todo:cache:v1'
const MAX_CHARS = 1_500_000 // около 3 МБ в UTF-16 — половина типичной квоты localStorage

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Стоит ли хранить ключ: без даты — всегда, с датой — только сегодняшний (неделя — текущая). */
export function persistable(key: string, today: DateStr): boolean {
  if (key === 'projects') return true
  const m = /^(day|tasks|counts|week):(?:.*:)?(\d{4}-\d{2}-\d{2})$/.exec(key)
  if (!m) return false
  if (m[1] === 'week') return m[2] <= today && m[2] > addDays(today, -7)
  return m[2] === today
}

export function restoreCache(cache: Cache, storage: StorageLike | null, today: DateStr): void {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return
    const snapshot = JSON.parse(raw) as Record<string, unknown>
    cache.restore(Object.fromEntries(Object.entries(snapshot).filter(([k]) => persistable(k, today))))
  } catch {
    /* битый снимок или хранилище недоступно — начнём с пустого */
  }
}

/** Сохранять снимок после изменений (с задержкой, одним куском). Возвращает отписку. */
export function persistCache(cache: Cache, storage: StorageLike, today: () => DateStr, delay = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = cache.subscribeAll(() => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        const d = today()
        const raw = JSON.stringify(cache.dump((k) => persistable(k, d)))
        if (raw.length <= MAX_CHARS) storage.setItem(STORAGE_KEY, raw)
      } catch {
        /* нет места или запрещено — просто без холодного кэша */
      }
    }, delay)
  })
  return () => {
    clearTimeout(timer)
    unsubscribe()
  }
}

/** Выход: данные не должны пережить сессию. */
export function forgetCache(cache: Cache, storage: StorageLike | null): void {
  cache.clear()
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    /* хранилище недоступно */
  }
}
