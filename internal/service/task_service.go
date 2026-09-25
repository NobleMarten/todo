package service

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

const (
	maxTitleLen         = 120
	archiveLimit        = 50  // archive без limit всё равно отдаётся страницами
	archiveLimitMax     = 200 // и страница не больше этого
	activityDaysDefault = 365
)

type TaskService struct {
	tasks    storage.TaskRepo
	projects storage.ProjectRepo
	loc      *time.Location // таймзона приложения (APP_TZ): в ней считаются «сегодня» и границы дней
}

func NewTaskService(tasks storage.TaskRepo, projects storage.ProjectRepo, loc *time.Location) *TaskService {
	return &TaskService{tasks: tasks, projects: projects, loc: loc}
}

func ValidateTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", model.ErrEmptyTitle
	}
	if len([]rune(title)) > maxTitleLen {
		return "", model.ErrTitleTooLong
	}
	return title, nil
}

func ValidatePriority(p string) error {
	switch p {
	case "high", "medium", "low":
		return nil
	}
	return fmt.Errorf("%w: %q", model.ErrInvalidPriority, p)
}

// validID — id задач и списков в базе INT4: больше MaxInt32 не бывает,
// и такое число лучше отбить здесь, чем получить от Postgres ошибку диапазона (500).
func validID(id int) bool {
	return id > 0 && id <= math.MaxInt32
}

// dateOrToday — дата, присланная клиентом (его локальное «сегодня»), либо сегодня в APP_TZ.
func dateOrToday(d *model.Date, loc *time.Location) model.Date {
	if d != nil && !d.IsZero() {
		return *d
	}
	return model.Today(loc)
}

// uniqueIDs убирает повторы и неположительные id, сохраняя порядок первого вхождения.
func uniqueIDs(ids []int) []int {
	seen := make(map[int]bool, len(ids))
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if validID(id) && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// Add создаёт задачу. Подзадача всегда живёт в списке родителя, присланный project_id игнорируется.
func (s *TaskService) Add(ctx context.Context, nt storage.NewTask) (model.Task, error) {
	title, err := ValidateTitle(nt.Title)
	if err != nil {
		return model.Task{}, err
	}
	nt.Title = title

	if nt.Priority == "" {
		nt.Priority = "low"
	}
	if err := ValidatePriority(nt.Priority); err != nil {
		return model.Task{}, err
	}

	if nt.Repeat != nil {
		if nt.ParentID != nil {
			return model.Task{}, fmt.Errorf("%w: subtasks cannot repeat", model.ErrInvalidRepeat)
		}
		rule, err := model.ParseRepeat(*nt.Repeat)
		if err != nil {
			return model.Task{}, err
		}
		canon := rule.String()
		nt.Repeat = &canon
	}

	if nt.ParentID != nil {
		parent, err := s.getParent(ctx, *nt.ParentID)
		if err != nil {
			return model.Task{}, err
		}
		if parent.ParentID != nil {
			return model.Task{}, model.ErrSubtaskTooDeep
		}
		nt.ProjectID = parent.ProjectID
	} else if nt.ProjectID != nil {
		if err := s.checkProject(ctx, *nt.ProjectID); err != nil {
			return model.Task{}, err
		}
	}

	return s.tasks.CreateTask(ctx, nt)
}

// getParent — будущий родитель; в сообщении видно, что не нашёлся именно он, а не сама задача.
func (s *TaskService) getParent(ctx context.Context, id int) (model.Task, error) {
	if !validID(id) {
		return model.Task{}, fmt.Errorf("parent: %w", model.ErrInvalidID)
	}
	parent, err := s.tasks.GetTask(ctx, id)
	if err != nil {
		return model.Task{}, fmt.Errorf("parent %d: %w", id, err)
	}
	return parent, nil
}

func (s *TaskService) checkProject(ctx context.Context, id int) error {
	if !validID(id) {
		return fmt.Errorf("%w: project %d", model.ErrProjectNotFound, id)
	}
	_, err := s.projects.GetProject(ctx, id)
	return err
}

// Get отдаёт задачу вместе с полным списком подзадач.
func (s *TaskService) Get(ctx context.Context, id int) (model.Task, error) {
	if !validID(id) {
		return model.Task{}, model.ErrInvalidID
	}
	task, err := s.tasks.GetTask(ctx, id)
	if err != nil {
		return model.Task{}, err
	}
	task.Subtasks, err = s.tasks.Subtasks(ctx, id)
	if err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (s *TaskService) Patch(ctx context.Context, id int, p storage.TaskPatch) (model.Task, error) {
	if !validID(id) {
		return model.Task{}, model.ErrInvalidID
	}
	if p.Empty() {
		return model.Task{}, model.ErrNothingToUpdate
	}
	if p.Title != nil {
		title, err := ValidateTitle(*p.Title)
		if err != nil {
			return model.Task{}, err
		}
		p.Title = &title
	}
	if p.Priority != nil {
		if err := ValidatePriority(*p.Priority); err != nil {
			return model.Task{}, err
		}
	}
	if p.Repeat.Set && p.Repeat.Value != nil {
		rule, err := model.ParseRepeat(*p.Repeat.Value)
		if err != nil {
			return model.Task{}, err
		}
		canon := rule.String()
		p.Repeat.Value = &canon
	}

	current, err := s.tasks.GetTask(ctx, id)
	if err != nil {
		return model.Task{}, err
	}

	if p.Done != nil {
		if *p.Done && current.Done {
			return model.Task{}, model.ErrAlreadyDone
		}
		if !*p.Done && !current.Done {
			return model.Task{}, model.ErrAlreadyUndone
		}
	}

	// подзадача живёт в списке родителя; сменить его можно только вместе с parent_id
	if p.ProjectID.Set && current.ParentID != nil && !p.ParentID.Set {
		return model.Task{}, fmt.Errorf("%w: subtask follows its parent's project", model.ErrInvalidBody)
	}
	if p.ProjectID.Set && p.ProjectID.Value != nil {
		if err := s.checkProject(ctx, *p.ProjectID.Value); err != nil {
			return model.Task{}, err
		}
	}

	// Глубина ровно 1: родитель сам корневой, а у будущей подзадачи нет своих подзадач.
	if p.ParentID.Set && p.ParentID.Value != nil {
		parentID := *p.ParentID.Value
		if parentID == id || (current.SubtaskStats != nil && current.SubtaskStats.Total > 0) {
			return model.Task{}, model.ErrSubtaskTooDeep
		}
		parent, err := s.getParent(ctx, parentID)
		if err != nil {
			return model.Task{}, err
		}
		if parent.ParentID != nil {
			return model.Task{}, model.ErrSubtaskTooDeep
		}
		p.ProjectID = model.Opt[int]{Set: true, Value: parent.ProjectID}
	}

	// повторяться может только корневая задача
	willBeSub := current.ParentID != nil
	if p.ParentID.Set {
		willBeSub = p.ParentID.Value != nil
	}
	repeat := current.Repeat
	if p.Repeat.Set {
		repeat = p.Repeat.Value
	}
	if willBeSub && repeat != nil {
		return model.Task{}, fmt.Errorf("%w: subtasks cannot repeat", model.ErrInvalidRepeat)
	}

	// Выполнили повторяющуюся — правило уезжает на следующую задачу, у выполненной остаётся история.
	// Если снять с неё галочку, она станет обычной: вторая копия не появится.
	if p.Done != nil && *p.Done && repeat != nil {
		p.Repeat = model.Opt[string]{Set: true}
	}
	done, err := s.tasks.PatchTask(ctx, id, p)
	if err != nil {
		return model.Task{}, err
	}
	if p.Done != nil && *p.Done && repeat != nil {
		if err := s.spawnNext(ctx, done, *repeat); err != nil {
			// следующая не создалась — откатываем выполнение, чтобы правило не потерялось
			_, _ = s.tasks.PatchTask(ctx, id, storage.TaskPatch{
				Done:   ptrTo(false),
				Repeat: model.Opt[string]{Set: true, Value: repeat},
			})
			return model.Task{}, fmt.Errorf("create next occurrence: %w", err)
		}
	}
	return done, nil
}

func ptrTo[T any](v T) *T { return &v }

// nextDates — даты следующей копии повторяющейся задачи. Опорная дата — «делаю», иначе дедлайн,
// иначе сегодня; следующая — первая подходящая после неё, но не раньше сегодня (выполнили с опозданием —
// не плодим просроченные). Обе даты сдвигаются на одно и то же число дней, промежуток между ними сохраняется.
// Без дат копия получает «делаю» = следующий день по правилу.
func nextDates(t model.Task, rule model.Repeat, today model.Date) (scheduled, due *model.Date) {
	base := today
	switch {
	case t.ScheduledFor != nil:
		base = *t.ScheduledFor
	case t.DueDate != nil:
		base = *t.DueDate
	}
	next := rule.After(base)
	if next.Before(today) {
		next = rule.After(today.AddDays(-1))
	}
	shift := model.DaysBetween(base, next)
	if t.ScheduledFor != nil {
		d := t.ScheduledFor.AddDays(shift)
		scheduled = &d
	}
	if t.DueDate != nil {
		d := t.DueDate.AddDays(shift)
		due = &d
	}
	if scheduled == nil && due == nil {
		scheduled = &next
	}
	return scheduled, due
}

// spawnNext создаёт следующую копию выполненной повторяющейся задачи (без подзадач).
func (s *TaskService) spawnNext(ctx context.Context, done model.Task, repeat string) error {
	rule, err := model.ParseRepeat(repeat)
	if err != nil {
		return err
	}
	scheduled, due := nextDates(done, rule, model.Today(s.loc))
	_, err = s.tasks.CreateTask(ctx, storage.NewTask{
		Title:        done.Title,
		Priority:     done.Priority,
		ProjectID:    done.ProjectID,
		DueDate:      due,
		ScheduledFor: scheduled,
		Note:         done.Note,
		Repeat:       &repeat,
	})
	return err
}

func (s *TaskService) Delete(ctx context.Context, id int) error {
	if !validID(id) {
		return model.ErrInvalidID
	}
	return s.tasks.DeleteTask(ctx, id)
}

// ListQuery — разобранные параметры GET /tasks. Пустые строки и nil — «не задано».
type ListQuery struct {
	View      string
	ProjectID *int
	Done      *bool
	From, To  *model.Date
	Sort      string
	Order     string
	Limit     int
	Offset    int
	Today     *model.Date
}

var sortFields = map[string]storage.SortField{
	"position":   storage.SortPosition,
	"due_date":   storage.SortDueDate,
	"priority":   storage.SortPriority,
	"created_at": storage.SortCreatedAt,
	"done_at":    storage.SortDoneAt,
}

// List собирает вьюху в набор условий фильтра; сама выборка — в SQL.
func (s *TaskService) List(ctx context.Context, q ListQuery) ([]model.Task, int, error) {
	today := dateOrToday(q.Today, s.loc)
	notDone := false
	query := storage.TaskQuery{Filter: storage.TaskFilter{Done: &notDone}}
	f := &query.Filter

	switch q.View {
	case "", "all":
	case "today":
		f.ScheduledOn = &today
	case "week":
		f.AnyDateBetween = &storage.DateRange{From: today, To: today.AddDays(7)}
	case "overdue":
		f.DueBefore = &today
	case "inbox":
		f.Inbox = true
	case "project":
		if q.ProjectID == nil {
			return nil, 0, fmt.Errorf("%w: view=project requires project_id", model.ErrInvalidQuery)
		}
		if err := s.checkProject(ctx, *q.ProjectID); err != nil {
			return nil, 0, err
		}
	case "archive":
		done := true
		f.Done = &done
		query.Sort, query.Desc = storage.SortDoneAt, true
		query.Limit = archiveLimit
	default:
		return nil, 0, fmt.Errorf("%w: %q", model.ErrInvalidView, q.View)
	}

	if q.Done != nil {
		f.Done = q.Done
	}
	if q.ProjectID != nil && !validID(*q.ProjectID) {
		return nil, 0, fmt.Errorf("%w: project_id=%d", model.ErrInvalidQuery, *q.ProjectID)
	}
	f.ProjectID = q.ProjectID

	if (q.From == nil) != (q.To == nil) {
		return nil, 0, fmt.Errorf("%w: from and to go together", model.ErrInvalidQuery)
	}
	if q.From != nil {
		if q.From.After(*q.To) {
			return nil, 0, fmt.Errorf("%w: from after to", model.ErrInvalidQuery)
		}
		// to включительно: полуинтервал до полуночи следующего дня в APP_TZ
		r := &storage.TimeRange{From: q.From.Time(s.loc), To: q.To.AddDays(1).Time(s.loc)}
		if q.View == "archive" {
			f.DoneBetween = r
		} else {
			f.CreatedBetween = r
		}
	}

	if q.Sort != "" {
		field, ok := sortFields[q.Sort]
		if !ok {
			return nil, 0, fmt.Errorf("%w: sort=%q", model.ErrInvalidQuery, q.Sort)
		}
		query.Sort, query.Desc = field, false
	}
	switch q.Order {
	case "":
	case "asc":
		query.Desc = false
	case "desc":
		query.Desc = true
	default:
		return nil, 0, fmt.Errorf("%w: order=%q", model.ErrInvalidQuery, q.Order)
	}

	if q.Limit < 0 || q.Offset < 0 {
		return nil, 0, fmt.Errorf("%w: negative limit or offset", model.ErrInvalidQuery)
	}
	if q.Limit > 0 {
		query.Limit = q.Limit
	}
	if q.View == "archive" {
		query.Limit = min(query.Limit, archiveLimitMax)
	}
	query.Offset = q.Offset

	return s.tasks.ListTasks(ctx, query)
}

// ReorderScope — область, внутри которой переставляются задачи.
type ReorderScope struct {
	Type      string      `json:"type"` // project | day | inbox
	ProjectID *int        `json:"project_id"`
	Date      *model.Date `json:"date"`
}

func (s *TaskService) Reorder(ctx context.Context, scope ReorderScope, ids []int) error {
	var f storage.TaskFilter
	switch scope.Type {
	case "project":
		if scope.ProjectID == nil || !validID(*scope.ProjectID) {
			return fmt.Errorf("%w: project scope requires a valid project_id", model.ErrInvalidBody)
		}
		f.ProjectID = scope.ProjectID
	case "day":
		if scope.Date == nil || scope.Date.IsZero() {
			return fmt.Errorf("%w: day scope requires date", model.ErrInvalidBody)
		}
		f.ScheduledOn = scope.Date
	case "inbox":
		f.Inbox = true
	default:
		return fmt.Errorf("%w: scope.type=%q", model.ErrInvalidBody, scope.Type)
	}

	ids = uniqueIDs(ids)
	if len(ids) == 0 {
		return nil
	}
	return s.tasks.ReorderTasks(ctx, f, ids)
}

// Activity — выполненные задачи по дням для грида. По умолчанию — последний год до сегодня.
func (s *TaskService) Activity(ctx context.Context, from, to *model.Date) ([]model.DayCount, error) {
	end := dateOrToday(to, s.loc)
	start := end.AddDays(-(activityDaysDefault - 1))
	if from != nil {
		start = *from
	}
	if start.After(end) {
		return nil, fmt.Errorf("%w: from after to", model.ErrInvalidQuery)
	}
	return s.tasks.DoneActivity(ctx, storage.DateRange{From: start, To: end}, s.loc)
}
