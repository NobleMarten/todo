import { useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Props {
  label: string
  onClose: () => void
  children: ReactNode
}

/** Нижний шит поверх экрана: закрывается по фону и Escape. */
export function Sheet({ label, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // экран под шитом не должен прокручиваться вместе с ним
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="sheet-layer">
      <motion.div
        className="sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
      />
      <motion.div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        {children}
      </motion.div>
    </div>
  )
}
