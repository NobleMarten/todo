import { useRef, type ReactNode } from 'react'
import { motion, useDragControls, type DragControls, type PanInfo } from 'framer-motion'
import type { DateStr } from '../api/types'

/** День полосы «Недели» под точкой экрана: кнопки дней помечены data-day. */
function dayAt(point: { x: number; y: number }): DateStr | null {
  // PanInfo.point — координаты страницы, elementsFromPoint ждёт координаты окна
  const x = point.x - window.scrollX
  const y = point.y - window.scrollY
  for (const el of document.elementsFromPoint(x, y)) {
    const day = el.closest('[data-day]')?.getAttribute('data-day')
    if (day) return day
  }
  return null
}

interface Props {
  onHover: (day: DateStr | null) => void // подсветка дня, над которым тащат
  onDrop: (day: DateStr) => void
  /** true — тащится за весь элемент (чип бэклога); иначе только за ручку, которую рисует children. */
  whole?: boolean
  onTap?: () => void // нажатие без перетаскивания (только с whole)
  className?: string
  children: (controls: DragControls) => ReactNode
}

/**
 * Перетаскивание задачи на день полосы «Недели». Элемент едет за пальцем и возвращается на место;
 * если отпустили над днём — onDrop(день). Строки задач тащатся за ручку (как при сортировке),
 * чтобы не спорить со свайпом строки и прокруткой.
 */
export function DayDrag({ onHover, onDrop, whole, onTap, className, children }: Props) {
  const controls = useDragControls()
  const lastDay = useRef<DateStr | null>(null)
  const dragged = useRef(false)

  const onDrag = (_: unknown, info: PanInfo) => {
    const day = dayAt(info.point)
    if (day !== lastDay.current) {
      lastDay.current = day
      onHover(day)
    }
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const day = dayAt(info.point)
    lastDay.current = null
    onHover(null)
    if (day) onDrop(day)
  }

  return (
    <motion.div
      className={className}
      drag
      dragControls={controls}
      dragListener={Boolean(whole)}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={1}
      whileDrag={{ scale: 1.03, zIndex: 40, boxShadow: '0 10px 30px rgba(0,0,0,.45)' }}
      style={{ position: 'relative', touchAction: whole ? 'none' : undefined }}
      onDragStart={() => {
        dragged.current = true
      }}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onPointerDown={() => {
        dragged.current = false
      }}
      onClick={() => {
        if (whole && !dragged.current) onTap?.()
      }}
    >
      {children(controls)}
    </motion.div>
  )
}
