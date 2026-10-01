import { useEffect, useRef, useState } from 'react'

/** Сколько отметка «доигрывает» в строке, прежде чем задача уйдёт в «готово». */
export const COMPLETE_DELAY = 420

/**
 * Отметка «выполнено» с отыгрышем: сразу — заливка чекбокса, галочка и зачёркивание (completing),
 * а сама мутация — через COMPLETE_DELAY, иначе строка исчезает раньше, чем видно, что что-то произошло.
 * Вернуть задачу в работу — сразу. Повторное нажатие во время отыгрыша игнорируется.
 */
export function useCompleting(done: boolean, toggle: () => void) {
  const [completing, setCompleting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const onClick = () => {
    if (done) return toggle()
    if (completing) return
    setCompleting(true)
    navigator.vibrate?.(8) // Android; на iOS вибрации из браузера нет
    timer.current = setTimeout(() => {
      setCompleting(false)
      toggle()
    }, COMPLETE_DELAY)
  }

  return { checked: done || completing, completing, onClick }
}
