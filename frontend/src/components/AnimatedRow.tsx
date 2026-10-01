import type { ReactNode } from 'react'
import { motion, Reorder, useIsPresent, type DragControls } from 'framer-motion'

// Строки списков меняются анимированно, как в нативных списках: ушедшая схлопывается,
// соседние съезжают на её место, новая проявляется, переставленная доезжает до нового места.
// Высота анимируется только у уходящей строки; появление и сдвиг — transform/opacity.
// Родитель оборачивает строки в <AnimatePresence initial={false}>: при первом показе экрана анимаций нет.

const GAP = 0 // gap у .task-list (строки сгруппированы в карточку, зазора нет): уходящая строка забирает и его
const ENTER = { opacity: 0, y: 6 }
const SHOWN = { opacity: 1, y: 0 }
const EXIT = { opacity: 0, height: 0, marginBottom: -GAP, transition: { duration: 0.2, ease: 'easeOut' } } as const
const MOVE = { duration: 0.18, ease: 'easeOut' } as const

interface Props {
  id: number
  children: ReactNode
}

/** Строка списка задач (li). data-task-id — чтобы найти её после быстрого добавления. */
export function AnimatedRow({ id, children }: Props) {
  // пока строка схлопывается, содержимое не должно вылезать за её высоту
  const present = useIsPresent()
  return (
    <motion.li
      data-task-id={id}
      layout="position"
      initial={ENTER}
      animate={SHOWN}
      exit={EXIT}
      transition={MOVE}
      style={present ? undefined : { overflow: 'hidden' }}
    >
      {children}
    </motion.li>
  )
}

/** То же для строки, которую перетаскивают за ручку (Reorder.Item сам анимирует перестановку). */
export function AnimatedReorderRow({
  id,
  controls,
  onDragEnd,
  children,
}: Props & { controls: DragControls; onDragEnd: () => void }) {
  const present = useIsPresent()
  return (
    <Reorder.Item
      value={id}
      data-task-id={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="reorder-item"
      // поднятая строка — с тенью над карточкой списка
      whileDrag={{ scale: 1.02, boxShadow: '0 14px 34px rgba(0, 0, 0, 0.35)', zIndex: 5 }}
      initial={ENTER}
      animate={SHOWN}
      exit={EXIT}
      style={present ? undefined : { overflow: 'hidden' }}
    >
      {children}
    </Reorder.Item>
  )
}
