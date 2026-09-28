import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useIsPresent, useMotionValue, useTransform } from 'framer-motion'
import { blocksScroll, decide, shouldDismiss, velocity, type Decision, type Sample } from '../lib/sheetGesture'

interface Props {
  label: string
  onClose: () => void
  children: ReactNode
}

const SPRING = { type: 'spring', stiffness: 420, damping: 36 } as const
const EXIT = { duration: 0.22, ease: [0.32, 0.72, 0, 1] } as const

interface Gesture {
  id: number
  x0: number
  y0: number
  atTop: boolean
  fromHeader: boolean
  state: Decision
  samples: Sample[]
}

/** Фокус в поле ввода, на которое лёг палец: там жест — выделение текста и курсор, а не шит. */
function inFocusedField(target: Element): boolean {
  const a = document.activeElement
  return a instanceof HTMLElement && a.matches('input, textarea, select, [contenteditable]') && a.contains(target)
}

/**
 * Нижний шит поверх экрана: закрывается по фону, Escape и жестом вниз (как нативный bottom sheet).
 * От шапки шит тянется всегда, от тела — когда содержимое прокручено до верха (пороги — lib/sheetGesture).
 * Закрытие анимирует родительский AnimatePresence (exit), пока шит уходит — повторные закрытия гасятся.
 */
export function Sheet({ label, onClose, children }: Props) {
  const isPresent = useIsPresent()
  const sheetRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  // фон светлеет вместе с жестом
  const dim = useTransform(y, [0, 400], [1, 0])

  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = isPresent ? onClose : () => {}
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    // экран под шитом не должен прокручиваться вместе с ним
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    let g: Gesture | null = null
    let suppressClick = false

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const target = e.target as Element
      if (inFocusedField(target)) return
      g = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        atTop: el.scrollTop <= 0,
        fromHeader: Boolean(target.closest('.sheet-grabber, .sheet-top')),
        state: 'wait',
        samples: [{ t: e.timeStamp, y: 0 }],
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (g.state === 'wait') {
        g.state = decide(dx, dy, g.atTop, g.fromHeader)
        if (g.state === 'drag') {
          y.stop()
          el.setPointerCapture?.(e.pointerId)
        }
      }
      if (g.state !== 'drag') return
      y.set(Math.max(0, dy))
      g.samples.push({ t: e.timeStamp, y: dy })
      if (g.samples.length > 12) g.samples.shift()
    }
    const onUp = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return
      const dragged = g.state === 'drag'
      const v = velocity(g.samples)
      g = null
      if (!dragged) return
      // отпустили над кнопкой шапки — клик после жеста не должен сработать
      suppressClick = true
      setTimeout(() => (suppressClick = false), 0)
      if (e.type === 'pointerup' && shouldDismiss(y.get(), v)) {
        animate(y, el.offsetHeight, { duration: 0.18, ease: 'easeOut' }).then(() => closeRef.current())
      } else {
        animate(y, 0, SPRING)
      }
    }
    // pointermove приходит раньше touchmove: решение уже принято, гасим прокрутку/резинку iOS
    const onTouchMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (g.state === 'drag' || (g.state === 'wait' && blocksScroll(dx, dy, g.atTop, g.fromHeader))) e.preventDefault()
    }
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('click', onClick, true)
    }
  }, [y])

  return (
    // уходящий шит пропускает касания к экрану под ним
    <div className="sheet-layer" style={isPresent ? undefined : { pointerEvents: 'none' }}>
      <motion.div
        className="sheet-backdrop"
        onClick={() => closeRef.current()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: EXIT }}
        transition={{ duration: 0.16 }}
      >
        <motion.div className="sheet-backdrop-fill" style={{ opacity: dim }} />
      </motion.div>
      <motion.div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ y }}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', transition: EXIT }}
        transition={SPRING}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        {children}
      </motion.div>
    </div>
  )
}
