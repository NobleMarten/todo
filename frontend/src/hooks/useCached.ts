import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { errorText } from '../api/client'
import { cache, staleKeys, type Updater } from '../lib/cache'
import { notifyChanged, subscribeChanges, type Topic } from '../lib/sync'

// любая мутация помечает устаревшим всё, что от неё зависит, — в том числе экраны, которых сейчас нет:
// при следующем показе они нарисуют старое и тихо перечитаются
subscribeChanges((topics) => cache.invalidate(staleKeys(topics)), ['tasks', 'projects'])

/** Свежие данные не перечитываются при каждом показе экрана (переключение вкладок туда-обратно). */
export const MAX_AGE = 30_000
/** Сигналы шины за это время схлопываются в одно перечитывание: три правки в карточке — один GET. */
export const BUS_DEBOUNCE = 300

interface Options {
  /** Темы шины, по которым смонтированный хук перечитывается. */
  topics?: Topic[]
  /** Перечитывать при каждом показе, даже свежее (счётчики списков на экране «Списки»). */
  always?: boolean
  /** Текст, если первая загрузка не удалась. */
  errorText: string
}

/**
 * Данные по ключу из общего кэша (lib/cache): сразу — что есть, в фоне — перечитывание.
 * `loading` — только когда показать нечего; ошибка фонового перечитывания не видна, если данные есть.
 */
export function useCached<T>(key: string | null, fetcher: () => Promise<T>, opts: Options) {
  const { always = false, errorText: failText } = opts
  const topicsKey = (opts.topics ?? ['tasks']).join(',')
  const fetcherRef = useRef(fetcher)
  useLayoutEffect(() => {
    fetcherRef.current = fetcher
  })

  const subscribe = useCallback((fn: () => void) => (key ? cache.subscribe(key, fn) : () => {}), [key])
  const data = useSyncExternalStore(subscribe, () => (key ? cache.get<T>(key) : undefined))

  const [failure, setFailure] = useState<{ key: string; text: string } | null>(null)
  const error = failure && failure.key === key ? failure.text : null

  const revalidate = useCallback(async () => {
    if (!key) return
    try {
      await cache.fetch(key, () => fetcherRef.current())
      setFailure(null)
    } catch (e) {
      if (cache.get(key) === undefined) setFailure({ key, text: errorText(e, failText) })
    }
  }, [key, failText])

  const reload = useCallback(async () => {
    setFailure(null)
    await revalidate()
  }, [revalidate])

  // показ экрана: устаревшее (или всё, если always) — перечитать в фоне
  useEffect(() => {
    if (key && (always || cache.isStale(key, MAX_AGE))) void revalidate()
  }, [key, always, revalidate])

  // шина: другое место что-то поменяло — перечитать, схлопнув серию сигналов
  const listenerRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const listener = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void revalidate(), BUS_DEBOUNCE)
    }
    listenerRef.current = listener
    const unsubscribe = subscribeChanges(listener, topicsKey.split(',') as Topic[])
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [revalidate, topicsKey])

  // вернулись в приложение (PWA из фона) — устаревшее перечитать
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && key && cache.isStale(key, MAX_AGE)) void revalidate()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [key, revalidate])

  const set = useCallback((next: Updater<T>) => {
    if (key) cache.set<T>(key, next)
  }, [key])

  /** Сообщить остальным экранам (сам хук в рассылку не попадает). */
  const notify = useCallback((topics?: Topic[]) => {
    notifyChanged(listenerRef.current ?? undefined, topics)
  }, [])

  return {
    data,
    loading: key !== null && data === undefined && error === null,
    error,
    set,
    /** Перечитать сейчас (после своей мутации: раскладку по блокам решает сервер). */
    refresh: revalidate,
    /** «Повторить» после неудачной первой загрузки: снова скелетон и запрос. */
    reload,
    notify,
  }
}
