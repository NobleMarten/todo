import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { decideEdge, edgeBackEnabled, edgeProgress, shouldGoBack, startsAtEdge, type EdgeDecision } from '../lib/edgeSwipe'
import { velocity, type Sample } from '../lib/sheetGesture'

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
}

/**
 * Свайп «назад» от левого края (решения — lib/edgeSwipe). Пока палец тянет, у края выезжает индикатор
 * (элемент indicator рисует App); отпустили за порогом — onBack. Слушаем touch-события в фазе захвата:
 * жест, признанный нашим, гасит прокрутку (preventDefault у touchmove).
 */
export function useEdgeBack(active: boolean, onBack: () => void, indicator: RefObject<HTMLElement | null>) {
  const onBackRef = useRef(onBack)
  useLayoutEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    if (!active || !edgeBackEnabled(isIOS(), isStandalone())) return
    let g: { x0: number; y0: number; y: number; dx: number; state: EdgeDecision; samples: Sample[] } | null = null

    const show = (dx: number, y: number) => {
      const el = indicator.current
      if (!el) return
      const p = edgeProgress(dx)
      el.style.opacity = String(p)
      el.style.transform = `translate(${Math.round(-44 + 56 * p)}px, ${Math.round(y - 22)}px)`
      el.classList.toggle('ready', p >= 1)
    }
    const hide = () => {
      const el = indicator.current
      if (!el) return
      el.style.opacity = '0'
      el.classList.remove('ready')
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      g = startsAtEdge(t.clientX)
        ? { x0: t.clientX, y0: t.clientY, y: t.clientY, dx: 0, state: 'wait', samples: [{ t: e.timeStamp, y: 0 }] }
        : null
    }
    const onMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - g.x0
      if (g.state === 'wait') {
        g.state = decideEdge(dx, t.clientY - g.y0)
        if (g.state === 'cancel') {
          g = null
          return
        }
      }
      if (g.state !== 'track') return
      e.preventDefault()
      g.dx = dx
      g.y = t.clientY
      g.samples.push({ t: e.timeStamp, y: dx }) // velocity() считает по полю y — здесь это сдвиг по x
      if (g.samples.length > 12) g.samples.shift()
      show(dx, t.clientY)
    }
    const onEnd = (e: TouchEvent) => {
      if (!g) return
      const back = e.type === 'touchend' && g.state === 'track' && shouldGoBack(g.dx, velocity(g.samples))
      g = null
      hide()
      if (back) onBackRef.current()
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
