import { useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import { Task } from "./types/task"
import { addTodo, deleteTodo, getTodos, toggleTodo } from "./api/todos"
import { TaskList } from "./components/TaskList"
import { Toast, ToastState } from "./components/Toast"

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState<ToastState>(null)
  const toastTimer = useRef<number | null>(null)

  const remaining = useMemo(() => tasks.filter(t => !t.done).length, [tasks])

  function showToast(t: ToastState) {
    setToast(t)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  async function load() {
    try {
      setLoading(true)
      const data = await getTodos()
      setTasks(data)
    } catch (e) {
      console.error(e)
      showToast({ type: "error", text: "Не удалось загрузить задачи" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    const v = title.trim()
    if (!v || adding) return

    setAdding(true)

    // оптимистично показываем новую задачу сразу (временный id)
    const tempId = Date.now()
    const optimistic: Task = {
      id: tempId,
      title: v,
      done: false,
      created_at: new Date().toISOString(),
      done_at: undefined,
    }

    setTasks(prev => [optimistic, ...prev])
    setTitle("")

    try {
      const created = await addTodo(v)
      // заменяем temp задачу на реальную с id от сервера
      setTasks(prev => prev.map(t => (t.id === tempId ? created : t)))
      showToast({ type: "success", text: "Добавлено" })
    } catch (e) {
      // откатываем
      setTasks(prev => prev.filter(t => t.id !== tempId))
      showToast({ type: "error", text: "Не удалось добавить задачу" })
      console.error(e)
    } finally {
      setAdding(false)
    }
  }

  async function handleToggle(id: number, done: boolean) {
    if (busyIds.has(id)) return

    setBusyIds(prev => new Set(prev).add(id))
    // оптимистично
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, done } : t)))

    try {
      await toggleTodo(id, done)
    } catch (e) {
      // откат
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, done: !done } : t)))
      showToast({ type: "error", text: "Не удалось изменить статус" })
      console.error(e)
    } finally {
      setBusyIds(prev => {
        const copy = new Set(prev)
        copy.delete(id)
        return copy
      })
    }
  }

  async function handleDelete(id: number) {
    if (busyIds.has(id)) return

    setBusyIds(prev => new Set(prev).add(id))
    const before = tasks

    // оптимистично удаляем из UI
    setTasks(prev => prev.filter(t => t.id !== id))

    try {
      await deleteTodo(id)
      showToast({ type: "success", text: "Удалено" })
    } catch (e) {
      // откат
      setTasks(before)
      showToast({ type: "error", text: "Не удалось удалить" })
      console.error(e)
    } finally {
      setBusyIds(prev => {
        const copy = new Set(prev)
        copy.delete(id)
        return copy
      })
    }
  }

  return (
    <>
      <Toast toast={toast} />

      <div className="container">
        <div className="header">
          <h1 className="title">Todo</h1>
          <p className="subtitle">{loading ? "загрузка..." : `${remaining} осталось`}</p>
        </div>

        <div className="form">
          <input
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Новая задача"
            onKeyDown={e => {
              if (e.key === "Enter") handleAdd()
            }}
            disabled={adding}
          />
          <button className="btn btnPrimary" onClick={handleAdd} disabled={adding}>
            {adding ? <span className="spinner" /> : "Добавить"}
          </button>
        </div>

        {loading ? (
          <div className="footer">Подгружаем…</div>
        ) : (
          <TaskList tasks={tasks} onToggle={handleToggle} onDelete={handleDelete} busyIds={busyIds} />
        )}

        <div className="footer">Приколы включены: анимации, тосты, оптимистичные апдейты 😄</div>
      </div>
    </>
  )
}
