import { useLayoutEffect, useRef } from 'react'

// field-sizing: content есть в Chrome 123+ и Safari 26+; в браузерах постарше высоту считаем сами.
const NATIVE = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

/** Textarea растёт по содержимому. value — чтобы пересчитать после каждой правки. */
export function useAutosize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (NATIVE || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}
