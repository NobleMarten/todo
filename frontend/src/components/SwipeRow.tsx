import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { CalendarIcon, TrashIcon } from './icons'

interface Props {
  title: string // для подписей кнопок
  onDelete?: () => void // свайп влево открывает «удалить», нажатие на неё — подтверждение
  onToday?: () => void // свайп вправо до порога — «на сегодня»
  children: ReactNode
}

const REVEAL = 96 // ширина открытой кнопки «удалить»
const TODAY_MAX = 120 // дальше вправо строка не тянется
const OPEN_AT = 56 // влево дальше этого — кнопка остаётся открытой
const TODAY_AT = 80 // вправо дальше этого — ставим на сегодня
const SPRING = { type: 'spring', stiffness: 500, damping: 42 } as const

// открытой держим одну строку: открыли другую — предыдущая закрывается
let closeOpened: (() => void) | null = null

/**
 * Строка со свайпами (drag="x" у framer-motion): влево — открыть «удалить», вправо — «на сегодня».
 * Вертикальная прокрутка остаётся браузеру (touch-action: pan-y), клик после жеста гасится,
 * чтобы свайп не открывал карточку.
 *
 * Жест запускается вручную через dragControls: сам framer не начинает drag, если палец лёг
 * на вложенную кнопку, а строка задачи почти целиком из кнопок (чекбокс, заголовок, бейджи).
 */
export function SwipeRow({ title, onDelete, onToday, children }: Props) {
  const x = useMotionValue(0)
  const controls = useDragControls()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const movedRef = useRef(false)
  const downXRef = useRef(0)
  // подложка видна только когда строка сдвинута: у выполненной строки полупрозрачный фон
  const underOpacity = useTransform(x, [-8, 0, 8], [1, 0, 1])

  const close = () => {
    animate(x, 0, SPRING)
    setOpen(false)
    if (closeOpened === close) closeOpened = null
  }
  const closeRef = useRef(close)
  useLayoutEffect(() => {
    closeRef.current = close
  })

  // открытая строка закрывается касанием мимо неё
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeRef.current()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x
    if (onToday && (dx > TODAY_AT || (dx > 30 && info.velocity.x > 500))) {
      animate(x, 0, SPRING)
      onToday()
      return
    }
    if (onDelete && (dx < -OPEN_AT || (dx < -20 && info.velocity.x < -500))) {
      if (closeOpened && closeOpened !== close) closeOpened()
      closeOpened = close
      animate(x, -REVEAL, SPRING)
      setOpen(true)
      return
    }
    close()
  }

  return (
    <div className="swipe" ref={rootRef}>
      <motion.div className="swipe-under" style={{ opacity: underOpacity }} aria-hidden={!open}>
        <span className="swipe-today">
          {onToday && (
            <>
              <CalendarIcon />
              на сегодня
            </>
          )}
        </span>
        {onDelete && (
          <button
            className="swipe-delete"
            style={{ width: REVEAL }}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              close()
              onDelete()
            }}
            aria-label={`удалить: ${title}`}
          >
            <TrashIcon />
            удалить
          </button>
        )}
      </motion.div>
      <motion.div
        className="swipe-body"
        style={{ x }}
        drag="x"
        dragControls={controls}
        dragListener={false}
        // без глобальной блокировки framer: она «залипает», если строка ушла из списка посреди жеста
        // (свайп «на сегодня» переносит её в другой блок), и следующий свайп уже не стартует.
        // Родительский Reorder.Item стартует только от ручки, так что конфликтовать не с кем
        dragPropagation
        dragDirectionLock
        dragConstraints={{ left: onDelete ? -REVEAL : 0, right: onToday ? TODAY_MAX : 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        onPointerDown={(e) => {
          movedRef.current = false
          downXRef.current = e.clientX
          controls.start(e)
        }}
        onDragStart={() => {
          movedRef.current = true
        }}
        onDragEnd={onDragEnd}
        onClickCapture={(e) => {
          // после жеста или по открытой строке клик не должен дойти до кнопок строки
          // (клик сразу после открывающего свайпа строку не закрывает)
          // onDragStart приходит через кадр — сдвиг пальца проверяем ещё и по координатам
          if (movedRef.current || Math.abs(e.clientX - downXRef.current) > 8) {
            e.preventDefault()
            e.stopPropagation()
            movedRef.current = false
          } else if (open) {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
