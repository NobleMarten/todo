import { useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigationType } from 'react-router-dom'
import { createScrollMemory } from '../lib/scrollMemory'

const memory = createScrollMemory()
const WAIT_MS = 1500 // сколько ждать, пока экран дорастёт до нужной высоты (первая загрузка без кэша)

/** Прокрутить окно к y; если экран ещё короче — докручивать по мере роста, пока палец не тронул экран. */
function scrollWhenReady(y: number): () => void {
  const reachable = () => document.documentElement.scrollHeight - window.innerHeight >= y
  window.scrollTo(0, y)
  if (y === 0 || reachable()) return () => {}
  const ro = new ResizeObserver(() => {
    window.scrollTo(0, y)
    if (reachable()) stop()
  })
  const stop = () => {
    ro.disconnect()
    clearTimeout(timer)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('wheel', stop)
  }
  const timer = setTimeout(stop, WAIT_MS)
  ro.observe(document.body)
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('wheel', stop, { passive: true })
  return stop
}

/**
 * Прокрутка экранов (решение — lib/scrollMemory): вкладки помнят свою, «назад» возвращает прежнюю,
 * новый экран — сверху. key/pathname — экран под карточкой задачи: открытие и закрытие шита прокрутку не трогает.
 */
export function useScrollRestoration(key: string, pathname: string) {
  const navType = useNavigationType()
  // куда писать прокрутку: меняется синхронно с экраном, до того как браузер обрежет прокрутку под новую высоту
  const current = useRef({ key, pathname })

  useLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    current.current = { key, pathname }
    const y = memory.target(navType, key, pathname)
    if (y === null) return
    return scrollWhenReady(y)
    // navType читаем на момент смены экрана; сама по себе смена типа перехода прокрутку не трогает
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pathname])

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => memory.save(current.current.key, current.current.pathname, window.scrollY))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
}
