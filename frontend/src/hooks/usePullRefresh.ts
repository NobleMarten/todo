import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { PULL_AT, PULL_IGNORE, decidePull, pullDistance, pullProgress, shouldRefresh, type PullDecision } from '../lib/pullRefresh'
import { isScrollLocked } from '../lib/scrollLock'

/** Индикатор крутится не меньше этого: мгновенный ответ из кэша не должен выглядеть как «ничего не произошло». */
const MIN_SPIN = 500

/**
 * «Потянуть вниз — обновить» (решения — lib/pullRefresh). Жест начинается, только когда экран прокручен
 * в самый верх и шит не открыт; пока палец тянет, сверху опускается индикатор (элемент рисует App),
 * отпустили за порогом — onRefresh, индикатор крутится до конца запросов. Touch-события в фазе захвата,
 * как у свайпа «назад»: признанный жест гасит прокрутку (preventDefault у touchmove).
 */
export function usePullRefresh(active: boolean, onRefresh: () => Promise<void>, indicator: RefObject<HTMLElement | null>) {
  const onRefreshRef = useRef(onRefresh)
  useLayoutEffect(() => {
    onRefreshRef.current = onRefresh
  })

  useEffect(() => {
    if (!active) return
    let g: { x0: number; y0: number; d: number; state: PullDecision } | null = null
    let busy = false

    const show = (d: number) => {
      const el = indicator.current
      if (!el) return
      const p = pullProgress(d)
      el.classList.remove('settle')
      el.style.opacity = String(Math.min(1, p * 1.5))
      el.style.transform = `translate(-50%, ${Math.round(d)}px)`
      el.style.setProperty('--turn', `${Math.round(p * 270)}deg`)
      el.classList.toggle('ready', shouldRefresh(d))
    }
    const hide = () => {
      const el = indicator.current
      if (!el) return
      el.classList.add('settle')
      el.classList.remove('ready', 'busy')
      el.style.opacity = '0'
      el.style.transform = 'translate(-50%, 0px)'
    }

    const onStart = (e: TouchEvent) => {
      g = null
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || isScrollLocked()) return
      if (e.target instanceof Element && e.target.closest(PULL_IGNORE)) return
      const t = e.touches[0]
      g = { x0: t.clientX, y0: t.clientY, d: 0, state: 'wait' }
    }
    const onMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return
      const t = e.touches[0]
      const dy = t.clientY - g.y0
      if (g.state === 'wait') {
        g.state = decidePull(t.clientX - g.x0, dy)
        if (g.state === 'cancel') {
          g = null
          return
        }
      }
      if (g.state !== 'track') return
      e.preventDefault()
      g.d = pullDistance(dy)
      show(g.d)
    }
    const onEnd = (e: TouchEvent) => {
      if (!g) return
      const go = e.type === 'touchend' && g.state === 'track' && shouldRefresh(g.d)
      g = null
      if (!go) return hide()
      busy = true
      const el = indicator.current
      if (el) {
        el.classList.add('settle', 'busy')
        el.style.transform = `translate(-50%, ${PULL_AT}px)`
      }
      const minSpin = new Promise((r) => setTimeout(r, MIN_SPIN))
      void Promise.all([onRefreshRef.current().catch(() => {}), minSpin]).finally(() => {
        busy = false
        hide()
      })
    }

    document.addEventListener('touchstart', onStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onMove, { capture: true, passive: false })
    document.addEventListener('touchend', onEnd, { capture: true })
    document.addEventListener('touchcancel', onEnd, { capture: true })
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true })
      document.removeEventListener('touchmove', onMove, { capture: true })
      document.removeEventListener('touchend', onEnd, { capture: true })
      document.removeEventListener('touchcancel', onEnd, { capture: true })
      hide()
    }
  }, [active, indicator])
}
