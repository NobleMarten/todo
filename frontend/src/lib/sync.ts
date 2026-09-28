// Шина «данные изменились»: карточка задачи и экраны живут в разных хуках,
// и после мутации в одном месте остальные должны тихо перечитать своё.
// Тема говорит, что поменялось: задачи или списки (списки меняются редко — их хуки
// не перечитываются от каждой отметки задачи).
export type Topic = 'tasks' | 'projects'
type Listener = (topics: Topic[]) => void

const listeners = new Map<Listener, Topic[]>()

export function subscribeChanges(fn: Listener, topics: Topic[] = ['tasks']): () => void {
  listeners.set(fn, topics)
  return () => {
    listeners.delete(fn)
  }
}

/** Сообщить подписчикам этих тем, кроме источника (он уже обновил себя оптимистично). */
export function notifyChanged(source?: Listener, topics: Topic[] = ['tasks']): void {
  for (const [fn, want] of [...listeners]) {
    if (fn !== source && want.some((t) => topics.includes(t))) fn(topics)
  }
}
