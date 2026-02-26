export type Task = {
    id: number
    title: string
    done: boolean
    created_at?: string
    done_at?: string | null
  }
  
  export type ListTodosResponse = {
    items: Task[] | null
    total: number
    limit?: number
    offset?: number
  }
  
  export type ErrorResponse = {
    code?: string
    message?: string
  }
  
  const API_URL = import.meta.env.VITE_API_URL
  
  async function parseJsonSafe(res: Response) {
    const text = await res.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  
  async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, init)
    const data = await parseJsonSafe(res)
  
    if (!res.ok) {
      // бэк может отдавать твой ErrorResponse
      const err = (data ?? {}) as ErrorResponse
      const msg = err.message || `HTTP ${res.status}`
      throw new Error(msg)
    }
  
    return data as T
  }
  
  export async function getTodos(): Promise<ListTodosResponse> {
    return request<ListTodosResponse>(`${API_URL}/todos`)
  }
  
  export async function addTodo(title: string): Promise<Task> {
    return request<Task>(`${API_URL}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
  }
  
  export async function setDone(id: number, done: boolean): Promise<void> {
    // ВАЖНО: я делаю как “продовый” вариант из твоего бэка:
    // PUT /todos/{id}/done  и  PUT /todos/{id}/undone
    const action = done ? "done" : "undone"
    await request<void>(`${API_URL}/todos/${id}/${action}`, { method: "PUT" })
  }
  
  export async function deleteTodo(id: number): Promise<void> {
    await request<void>(`${API_URL}/todos/${id}`, { method: "DELETE" })
  }
  
  export async function clearTodos(): Promise<void> {
    // Тут, возможно, нужно подогнать под твой хендлер:
    // варианты: DELETE /todos/clear  или  DELETE /todos
    await request<void>(`${API_URL}/todos/clear`, { method: "POST" })
  }