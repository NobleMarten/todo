// Шина «данные изменились»: карточка задачи и экраны живут в разных хуках,
// и после мутации в одном месте остальные должны тихо перечитать своё.
type Listener = () => void

const listeners = new Set<Listener>()

export function subscribeChanges(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Сообщить всем подписчикам, кроме источника (он уже обновил себя оптимистично). */
export function notifyChanged(source?: Listener): void {
  for (const fn of listeners) if (fn !== source) fn()
}
