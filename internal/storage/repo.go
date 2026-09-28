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

// Все методы TaskRepo и ProjectRepo работают в пределах одного пользователя (userID — первый аргумент
// после ctx): чужие задачи и списки для них не существуют — Get отдаёт «не найдено», Patch/Delete их
// не находят, Reorder/PlanDay молча пропускают. userID явным аргументом, а не в контексте: забытая
// проверка не скомпилируется. Дополнительно база не даёт связать задачу с чужим списком или чужим
// родителем (составные внешние ключи, миграция 00008).

type TaskRepo interface {
	CreateTask(ctx context.Context, userID int, t NewTask) (model.Task, error)
	// GetTask возвращает model.ErrNotFound, если задачи нет. SubtaskStats заполнен.
	GetTask(ctx context.Context, userID, id int) (model.Task, error)
	// ListTasks отдаёт только корневые задачи с SubtaskStats; total посчитан до пагинации.
	ListTasks(ctx context.Context, userID int, q TaskQuery) (items []model.Task, total int, err error)
	Subtasks(ctx context.Context, userID, parentID int) ([]model.Task, error)
	PatchTask(ctx context.Context, userID, id int, p TaskPatch) (model.Task, error)
	DeleteTask(ctx context.Context, userID, id int) error
	// ReorderTasks в одной транзакции ставит position = индекс в ids тем задачам,
	// которые подходят под scope; остальные id молча пропускает.
	ReorderTasks(ctx context.Context, userID int, scope TaskFilter, ids []int) error
	// PlanDay ставит scheduled_for = date невыполненным задачам из add и снимает его
	// с задач из remove, если они были запланированы именно на date.
	PlanDay(ctx context.Context, userID int, date model.Date, add, remove []int) error
	// DoneActivity — число выполненных корневых задач по дням done_at в таймзоне loc, только дни с done > 0.
	DoneActivity(ctx context.Context, userID int, days DateRange, loc *time.Location) ([]model.DayCount, error)
}

type ProjectRepo interface {
	// ListProjects отдаёт списки по position с Counts; overdue считается относительно today.
	ListProjects(ctx context.Context, userID int, includeArchived bool, today model.Date) ([]model.Project, error)
	// GetProject возвращает model.ErrProjectNotFound, если списка нет.
	GetProject(ctx context.Context, userID, id int) (model.Project, error)
	CreateProject(ctx context.Context, userID int, name, color string) (model.Project, error)
	PatchProject(ctx context.Context, userID, id int, p ProjectPatch) (model.Project, error)
	DeleteProject(ctx context.Context, userID, id int) error
	ReorderProjects(ctx context.Context, userID int, ids []int) error
}

// UserRepo — пользователи и их сессии. В сессии хранится только SHA-256 токена из cookie.
type UserRepo interface {
	// CreateUser возвращает model.ErrLoginTaken, если логин занят.
	CreateUser(ctx context.Context, login, passwordHash string) (model.User, error)
	// UserByLogin возвращает model.ErrUserNotFound, если такого логина нет.
	UserByLogin(ctx context.Context, login string) (model.User, error)
	SetPassword(ctx context.Context, userID int, passwordHash string) error
	ListUsers(ctx context.Context) ([]model.User, error)

	// CreateSession заодно удаляет истёкшие сессии: отдельная уборка не нужна.
	CreateSession(ctx context.Context, userID int, tokenHash []byte, expires time.Time) error
	// SessionUser — владелец живой (expires_at > now) сессии и её срок; иначе model.ErrUnauthorized.
	SessionUser(ctx context.Context, tokenHash []byte, now time.Time) (model.User, time.Time, error)
	ExtendSession(ctx context.Context, tokenHash []byte, expires time.Time) error
	DeleteSession(ctx context.Context, tokenHash []byte) error
	// DeleteUserSessions — выход на всех устройствах (после смены пароля).
	DeleteUserSessions(ctx context.Context, userID int) error
}
