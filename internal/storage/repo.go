package storage

import (
	"context"
	"time"
	"todo/internal/model"
)

// DateRange — отрезок календарных дат, обе границы включительно.
type DateRange struct {
	From, To model.Date
}

// TimeRange — полуинтервал моментов времени [From, To).
type TimeRange struct {
	From, To time.Time
}

// TaskFilter — условия отбора корневых задач. Все заданные условия объединяются через AND,
// нулевое значение поля означает «не фильтровать». Вьюхи и блоки экрана «Сегодня»
// собираются из этих условий в сервисе, репозиторий только переводит их в SQL.
type TaskFilter struct {
	Done            *bool
	ProjectID       *int
	Inbox           bool        // project_id IS NULL
	ScheduledOn     *model.Date // scheduled_for = дата
	NotScheduledOn  *model.Date // scheduled_for IS DISTINCT FROM дата (NULL проходит)
	ScheduledBefore *model.Date
	DueBefore       *model.Date
	DueBetween      *DateRange
	AnyDateBetween  *DateRange // due_date или scheduled_for попадает в отрезок
	NoDates         bool       // ни дедлайна, ни дня работы
	CreatedBetween  *TimeRange
	DoneBetween     *TimeRange
	UpdatedBefore   *time.Time
	Search          string // подстрока в заголовке или заметке без учёта регистра
}

type SortField string

const (
	SortPosition     SortField = "position"
	SortDueDate      SortField = "due_date"
	SortPriority     SortField = "priority"
	SortCreatedAt    SortField = "created_at"
	SortDoneAt       SortField = "done_at"
	SortUpdatedAt    SortField = "updated_at"
	SortScheduledFor SortField = "scheduled_for"
)

// TaskQuery — фильтр плюс сортировка и пагинация. При равенстве ключа порядок
// добивается по position, id, так что выдача всегда детерминирована.
type TaskQuery struct {
	Filter TaskFilter
	Sort   SortField // пусто — SortPosition
	Desc   bool
	Limit  int // 0 — без лимита
	Offset int // работает и без Limit
}

// NewTask — поля новой задачи; валидацию и наследование проекта от родителя делает сервис.
type NewTask struct {
	Title        string
	Priority     string
	ProjectID    *int
	ParentID     *int
	DueDate      *model.Date
	ScheduledFor *model.Date
	Note         *string
	Repeat       *string // каноническая строка model.Repeat
}

// TaskPatch — изменения задачи. Title/Done/Priority не бывают null, поэтому это просто указатели;
// у остальных полей null означает «очистить», и нужен model.Opt.
// done_at репозиторий выставляет сам вслед за Done; смена ProjectID переносит и подзадачи.
type TaskPatch struct {
	Title        *string
	Done         *bool
	Priority     *string
	ProjectID    model.Opt[int]
	ParentID     model.Opt[int]
	DueDate      model.Opt[model.Date]
	ScheduledFor model.Opt[model.Date]
	Note         model.Opt[string]
	Repeat       model.Opt[string]
}

func (p TaskPatch) Empty() bool {
	return p.Title == nil && p.Done == nil && p.Priority == nil && !p.ProjectID.Set &&
		!p.ParentID.Set && !p.DueDate.Set && !p.ScheduledFor.Set && !p.Note.Set && !p.Repeat.Set
}

type ProjectPatch struct {
	Name     *string
	Color    *string
	Archived *bool
}

type TaskRepo interface {
	CreateTask(ctx context.Context, t NewTask) (model.Task, error)
	// GetTask возвращает model.ErrNotFound, если задачи нет. SubtaskStats заполнен.
	GetTask(ctx context.Context, id int) (model.Task, error)
	// ListTasks отдаёт только корневые задачи с SubtaskStats; total посчитан до пагинации.
	ListTasks(ctx context.Context, q TaskQuery) (items []model.Task, total int, err error)
	Subtasks(ctx context.Context, parentID int) ([]model.Task, error)
	PatchTask(ctx context.Context, id int, p TaskPatch) (model.Task, error)
	DeleteTask(ctx context.Context, id int) error
	// ReorderTasks в одной транзакции ставит position = индекс в ids тем задачам,
	// которые подходят под scope; остальные id молча пропускает.
	ReorderTasks(ctx context.Context, scope TaskFilter, ids []int) error
	// PlanDay ставит scheduled_for = date невыполненным задачам из add и снимает его
	// с задач из remove, если они были запланированы именно на date.
	PlanDay(ctx context.Context, date model.Date, add, remove []int) error
	// DoneActivity — число выполненных корневых задач по дням done_at в таймзоне loc, только дни с done > 0.
	DoneActivity(ctx context.Context, days DateRange, loc *time.Location) ([]model.DayCount, error)
}

type ProjectRepo interface {
	// ListProjects отдаёт списки по position с Counts; overdue считается относительно today.
	ListProjects(ctx context.Context, includeArchived bool, today model.Date) ([]model.Project, error)
	// GetProject возвращает model.ErrProjectNotFound, если списка нет.
	GetProject(ctx context.Context, id int) (model.Project, error)
	CreateProject(ctx context.Context, name, color string) (model.Project, error)
	PatchProject(ctx context.Context, id int, p ProjectPatch) (model.Project, error)
	DeleteProject(ctx context.Context, id int) error
	ReorderProjects(ctx context.Context, ids []int) error
}
