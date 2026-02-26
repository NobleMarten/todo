import React, { useEffect, useMemo, useState } from "react"
import { addTodo, clearTodos, deleteTodo, getTodos, setDone, type Task } from "./api"

export default function App() {
  const [items, setItems] = useState<Task[]>([])
  const [title, setTitle] = useState("")
  const [loading, setLoading] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [busyClear, setBusyClear] = useState(false)

  const doneCount = useMemo(() => items.filter((t) => t.done).length, [items])

  async function refresh() {
    setLoading(true)
    setErrMsg(null)
    try {
      const res = await getTodos()
      setItems(res.items ?? [])
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function onAdd() {
    const t = title.trim()
    if (!t) return
    setErrMsg(null)
    setLoading(true)
    try {
      const created = await addTodo(t)
      setTitle("")
      setItems((prev) => [created, ...prev])
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  async function onToggle(id: number, nextDone: boolean) {
    setErrMsg(null)
    setBusy((p) => ({ ...p, [id]: true }))
    try {
      await setDone(id, nextDone)
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, done: nextDone } : t)))
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setBusy((p) => ({ ...p, [id]: false }))
    }
  }

  async function onDelete(id: number) {
    setErrMsg(null)
    setBusy((p) => ({ ...p, [id]: true }))
    try {
      await deleteTodo(id)
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setBusy((p) => ({ ...p, [id]: false }))
    }
  }

  async function onClear() {
    setErrMsg(null)
    setBusyClear(true)
    try {
      await clearTodos()
      setItems([])
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setBusyClear(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ marginBottom: 8 }}>Todo</h1>

      <div style={{ opacity: 0.7, marginBottom: 16 }}>
        total: {items.length} • done: {doneCount}
      </div>

      {errMsg && (
        <div style={{ marginBottom: 16, padding: 12, border: "1px solid #ffb4b4", borderRadius: 10, background: "#fff5f5" }}>
          {errMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add task..."
          style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd()
          }}
        />
        <button
          onClick={onAdd}
          disabled={loading}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
        >
          Add
        </button>

        <button
          onClick={onClear}
          disabled={busyClear || items.length === 0}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
        >
          {busyClear ? "Clearing..." : "Clear"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && <div style={{ opacity: 0.7 }}>Loading...</div>}

        {!loading && items.length === 0 && <div style={{ opacity: 0.7 }}>No tasks yet</div>}

        {items.map((t) => {
          const isBusy = !!busy[t.id]
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 12,
                background: "white",
              }}
            >
              <input
                type="checkbox"
                checked={t.done}
                disabled={isBusy}
                onChange={(e) => onToggle(t.id, e.target.checked)}
              />
              <div style={{ flex: 1, textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.6 : 1 }}>
                {t.title}
              </div>
              <button
                onClick={() => onDelete(t.id)}
                disabled={isBusy}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
              >
                {isBusy ? "..." : "Delete"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}