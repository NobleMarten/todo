package model

import "time"

type Task struct {
	ID           int        `json:"id"`
	Title        string     `json:"title"`
	Done         bool       `json:"done"`
	Priority     string     `json:"priority"` // high | medium | low
	ProjectID    *int       `json:"project_id"`
	ParentID     *int       `json:"parent_id"`
	DueDate      *Date      `json:"due_date"`      // дедлайн: позже нельзя
	ScheduledFor *Date      `json:"scheduled_for"` // день, когда садишься за задачу
	Position     int        `json:"position"`
	Note         *string    `json:"note"`
	CreatedAt    time.Time  `json:"created_at"`
	DoneAt       *time.Time `json:"done_at"`
	UpdatedAt    time.Time  `json:"updated_at"`              // последняя правка через PATCH; reorder не считается
	Subtasks     []Task     `json:"subtasks,omitempty"`      // только в GET /tasks/{id}
	SubtaskStats *Stats     `json:"subtask_stats,omitempty"` // только у корневых задач в списках
}

// Stats — прогресс подзадач: сколько выполнено из скольких.
type Stats struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

// DayCount — сколько задач выполнено за календарный день (грид активности).
type DayCount struct {
	Date Date `json:"date"`
	Done int  `json:"done"`
}
