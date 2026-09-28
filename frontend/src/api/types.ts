// Календарная дата без времени: "2026-10-04". Сравнивается как строка.
export type DateStr = string

export type Priority = 'high' | 'medium' | 'low'

export type Stats = { done: number; total: number }

export type Task = {
  id: number
  title: string
  done: boolean
  priority: Priority
  project_id: number | null
  parent_id: number | null
  due_date: DateStr | null
  scheduled_for: DateStr | null
  position: number
  note: string | null
  repeat: string | null // правило повтора (lib/repeat), null — не повторяется
  created_at: string
  done_at: string | null
  updated_at: string
  postponed: number // сколько раз due_date/scheduled_for сдвигали позже
  subtasks?: Task[] // только в GET /tasks/{id}
  subtask_stats?: Stats // только у корневых задач в списках
}

export type ProjectCounts = { active: number; overdue: number }

export type Project = {
  id: number
  name: string
  color: string
  position: number
  archived: boolean
  created_at: string
  counts?: ProjectCounts // только в GET /projects
}

export type ListResponse<T> = { items: T[]; total: number }

// Вьюхи GET /tasks (раздел 3 REDESIGN.md).
export type View = 'today' | 'week' | 'overdue' | 'inbox' | 'project' | 'all' | 'archive'

export type NewTask = {
  title: string
  priority?: Priority
  project_id?: number | null
  parent_id?: number | null
  due_date?: DateStr | null
  scheduled_for?: DateStr | null
  repeat?: string | null
}

// PATCH: отсутствующий ключ — «не трогать», null — «очистить».
export type TaskPatch = Partial<{
  title: string
  done: boolean
  priority: Priority
  project_id: number | null
  parent_id: number | null
  due_date: DateStr | null
  scheduled_for: DateStr | null
  note: string | null
  repeat: string | null
}>

export type ProjectPatch = Partial<{ name: string; color: string; archived: boolean }>

export type ReorderScope =
  | { type: 'project'; project_id: number }
  | { type: 'inbox' }
  | { type: 'day'; date: DateStr }

// GET /day: каждая задача попадает ровно в один из planned / overdue / carry_over.
export type Day = {
  date: DateStr
  planned: Task[]
  overdue: Task[]
  carry_over: Task[]
  done_today: Task[]
  counts: { planned: number; done: number; overdue: number }
}

// GET /day/suggestions: уже запланированное на дату сюда не попадает.
export type Suggestions = {
  overdue: Task[]
  due_soon: Task[]
  stale: Task[]
}

// GET /stats/activity: только дни, где что-то выполнено.
export type DayCount = { date: DateStr; done: number }

// GET /stats/summary: всё по корневым задачам, дни и часы — в APP_TZ сервера.
export type StatsTotals = {
  done: number
  created: number
  created_done: number // из созданных за период уже выполнено
  on_time: number // выполнены не позже дедлайна
  late: number
  active_days: number
  lead_hours: number | null // медиана «создана → выполнена»
}

export type StatsDay = { date: DateStr; done: number; created: number }

export type TaskRef = { id: number; title: string; created_at: string; postponed: number }

export type StatsSummary = {
  from: DateStr
  to: DateStr
  totals: StatsTotals
  prev: StatsTotals // такой же период перед from
  days: StatsDay[] // каждый день периода
  lists: { project_id: number | null; done: number }[] // по убыванию, null — входящие
  by_priority: Record<Priority, number>
  weekday: number[] // 7, 0 = пн
  hours: number[] // 24
  backlog: {
    active: number
    overdue: number
    no_dates: number
    inbox: number
    stale: number // не менялись дольше 30 дней
    postponed: number
    age_days: number | null
    oldest: TaskRef | null
    delayed: TaskRef[] // чаще всего переносимые, до 5
  }
}

// GET /day/week — экран «Неделя».
export type WeekDay = { date: DateStr; scheduled: Task[]; deadlines: Task[]; done: Task[] }

export type Week = {
  from: DateStr
  to: DateStr
  days: WeekDay[]
  upcoming: Task[] // дедлайны после недели
  backlog: Task[] // без дат
  backlog_total: number
}
