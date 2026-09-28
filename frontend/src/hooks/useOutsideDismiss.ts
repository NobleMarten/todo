import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Пока active, касание или клик вне ref закрывает всплывашку (подсказку графика): на телефоне нет
 * «увёл курсор», поэтому без этого плашка висела до следующего касания графика.
 */
export function useOutsideDismiss(ref: RefObject<HTMLElement | null>, active: boolean, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss)
  useLayoutEffect(() => {
    dismissRef.current = onDismiss
  })
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) dismissRef.current()
    }
    // capture: сработает, даже если кто-то ниже остановит всплытие (свайп строки, таб-бар)
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [ref, active])
}
