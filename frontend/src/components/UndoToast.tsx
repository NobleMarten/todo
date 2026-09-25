import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dismissPendingError, subscribePending, undoDelete, type PendingState } from '../lib/pendingDelete'

/** Внизу экрана: «удалено · вернуть» на время отложенного удаления, или ошибка, если удалить не вышло. */
export function UndoToast() {
  const [state, setState] = useState<PendingState>(null)
  useEffect(() => subscribePending(setState), [])

  // ошибка висит 4 с, потом уходит сама
  useEffect(() => {
    if (state?.kind !== 'error') return
    const t = setTimeout(dismissPendingError, 4000)
    return () => clearTimeout(t)
  }, [state])

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          key={state.kind === 'pending' ? `p${state.id}` : 'error'}
          className={`toast ${state.kind === 'error' ? 'toast-error' : ''}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18 }}
        >
          {state.kind === 'pending' ? (
            <>
              <span className="toast-text">
                удалено{state.title ? ` «${state.title}»` : ''}
              </span>
              <button className="toast-action" onClick={undoDelete}>
                вернуть
              </button>
            </>
          ) : (
            <button className="toast-text" onClick={dismissPendingError}>
              {state.message}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
