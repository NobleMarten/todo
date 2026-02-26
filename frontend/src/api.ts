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
  
  export type FilterDone = 'all' | 'true' | 'false'
  export type SortField  = 'id' | 'date' | 'create_date'
  
  export interface FetchParams {
    done?:  FilterDone
    from?:  string
    to?:    string
    sort?:  SortField
    order?: 'asc' | 'desc'
    page?:  number
    limit?: number
  }
  
  const API_URL = import.meta.env.VITE_API_URL ?? ''
  
  // ── safe JSON parse ───────────────────────────────────────────────────────────
  
  async function parseJsonSafe(res: Response) {
    const text = await res.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { return null }
  }
  
  // ── base request ──────────────────────────────────────────────────────────────
  
  async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res  = await fetch(input, init)
    const data = await parseJsonSafe(res)
  
    if (!res.ok) {
      const err = (data ?? {}) as ErrorResponse
      throw new Error(err.message || `HTTP ${res.status}`)
    }
  
    return data as T
  }
  
  // ── GET /todos ────────────────────────────────────────────────────────────────
  // Supports: ?done=true|false, ?from=YYYY-MM-DD&to=YYYY-MM-DD,
  //           ?sort=id|date|create_date&order=asc|desc, ?page=N&limit=N
  
  export async function getTodos(params: FetchParams = {}): Promise<ListTodosResponse> {
    const q = new URLSearchParams()
    if (params.done && params.done !== 'all') q.set('done', params.done)
    if (params.from)  q.set('from',  params.from)
    if (params.to)    q.set('to',    params.to)
    if (params.sort)  q.set('sort',  params.sort)
    if (params.order) q.set('order', params.order)
    if (params.page)  q.set('page',  String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
  
    const qs = q.toString()
    const data = await request<ListTodosResponse | null>(`${API_URL}/todos${qs ? `?${qs}` : ''}`)
    return data ?? { items: [], total: 0 }
  }
  
  // ── GET /todos/:id ────────────────────────────────────────────────────────────
  
  export async function getTodoById(id: number): Promise<Task> {
    return request<Task>(`${API_URL}/todos/${id}`)
  }
  
  // ── POST /todos ───────────────────────────────────────────────────────────────
  
  export async function addTodo(title: string): Promise<Task> {
    return request<Task>(`${API_URL}/todos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title }),
    })
  }
  
  // ── PUT /todos/:id/done  |  PUT /todos/:id/undone ─────────────────────────────
  // handler: SetDone — returns 204 No Content
  
  export async function setDone(id: number, done: boolean): Promise<void> {
    const action = done ? 'done' : 'undone'
    await request<void>(`${API_URL}/todos/${id}/${action}`, { method: 'PUT' })
  }
  
  // ── PATCH /todos/:id ──────────────────────────────────────────────────────────
  // handler: PatchTodo — accepts { title?, done? }, returns updated Task
  
  export async function patchTodo(
    id:     number,
    fields: { title?: string; done?: boolean },
  ): Promise<Task> {
    return request<Task>(`${API_URL}/todos/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(fields),
    })
  }
  
  // ── PUT /todos/:id ────────────────────────────────────────────────────────────
  // handler: UpdTodo — full title replace, returns updated Task
  
  export async function updateTodo(id: number, title: string): Promise<Task> {
    return request<Task>(`${API_URL}/todos/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title }),
    })
  }
  
  // ── DELETE /todos/:id ─────────────────────────────────────────────────────────
  // handler: DeleteTodo — path-based id, returns 204
  
  export async function deleteTodo(id: number): Promise<void> {
    await request<void>(`${API_URL}/todos/${id}`, { method: 'DELETE' })
  }
  
  // ── POST /todos/clear ─────────────────────────────────────────────────────────
  // handler: ClearTask — clears all tasks, returns 204
  
  export async function clearTodos(): Promise<void> {
    await request<void>(`${API_URL}/todos/clear`, { method: 'POST' })
  }