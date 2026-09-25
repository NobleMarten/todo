package storage

import (
	"cmp"
	"context"
	"slices"
	"sync"
	"time"
	"todo/internal/model"
)

// FakeRepo — хранилище в памяти для тестов сервиса и хендлеров.
// Повторяет семантику PostgresRepo: те же условия TaskFilter, та же сортировка,
// каскад подзадач при удалении и переносе в другой список.
type FakeRepo struct {
	mu       sync.Mutex
	Tasks    []model.Task
	Projects []model.Project
	Now      func() time.Time // по умолчанию time.Now; тесты подменяют, чтобы зафиксировать время
}

var (
	_ TaskRepo    = (*FakeRepo)(nil)
	_ ProjectRepo = (*FakeRepo)(nil)
)

func (fr *FakeRepo) now() time.Time {
	if fr.Now != nil {
		return fr.Now()
	}
	return time.Now()
}

func (fr *FakeRepo) taskIndex(id int) int {
	return slices.IndexFunc(fr.Tasks, func(t model.Task) bool { return t.ID == id })
}

func (fr *FakeRepo) stats(id int) *model.Stats {
	var s model.Stats
	for _, t := range fr.Tasks {
		if t.ParentID != nil && *t.ParentID == id {
			s.Total++
			if t.Done {
				s.Done++
			}
		}
	}
	return &s
}

func (fr *FakeRepo) CreateTask(_ context.Context, nt NewTask) (model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	id, pos := 1, 1
	for _, t := range fr.Tasks {
		id = max(id, t.ID+1)
		pos = max(pos, t.Position+1)
	}
	now := fr.now()
	task := model.Task{
		ID:           id,
		Title:        nt.Title,
		Priority:     nt.Priority,
		ProjectID:    clonePtr(nt.ProjectID),
		ParentID:     clonePtr(nt.ParentID),
		DueDate:      clonePtr(nt.DueDate),
		ScheduledFor: clonePtr(nt.ScheduledFor),
		Position:     pos,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	fr.Tasks = append(fr.Tasks, task)
	task.SubtaskStats = &model.Stats{}
	return task, nil
}

func (fr *FakeRepo) GetTask(_ context.Context, id int) (model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()
	return fr.getTask(id)
}

func (fr *FakeRepo) getTask(id int) (model.Task, error) {
	i := fr.taskIndex(id)
	if i < 0 {
		return model.Task{}, model.ErrNotFound
	}
	task := fr.Tasks[i]
	task.SubtaskStats = fr.stats(id)
	return task, nil
}

func (fr *FakeRepo) ListTasks(_ context.Context, q TaskQuery) ([]model.Task, int, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	items := []model.Task{}
	for _, t := range fr.Tasks {
		if t.ParentID == nil && matches(t, q.Filter) {
			t.SubtaskStats = fr.stats(t.ID)
			items = append(items, t)
		}
	}
	slices.SortStableFunc(items, func(a, b model.Task) int { return compareTasks(a, b, q.Sort, q.Desc) })

	total := len(items)
	items = items[min(q.Offset, total):]
	if q.Limit > 0 {
		items = items[:min(q.Limit, len(items))]
	}
	return items, total, nil
}

func (fr *FakeRepo) Subtasks(_ context.Context, parentID int) ([]model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	subs := []model.Task{}
	for _, t := range fr.Tasks {
		if t.ParentID != nil && *t.ParentID == parentID {
			subs = append(subs, t)
		}
	}
	slices.SortStableFunc(subs, func(a, b model.Task) int { return compareTasks(a, b, SortPosition, false) })
	return subs, nil
}

func (fr *FakeRepo) PatchTask(_ context.Context, id int, p TaskPatch) (model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.taskIndex(id)
	if i < 0 {
		return model.Task{}, model.ErrNotFound
	}
	now := fr.now()
	t := &fr.Tasks[i]
	t.UpdatedAt = now
	if p.Title != nil {
		t.Title = *p.Title
	}
	if p.Done != nil {
		t.Done = *p.Done
		t.DoneAt = nil
		if *p.Done {
			t.DoneAt = &now
		}
	}
	if p.Priority != nil {
		t.Priority = *p.Priority
	}
	if p.ProjectID.Set {
		t.ProjectID = clonePtr(p.ProjectID.Value)
		for j := range fr.Tasks {
			if pid := fr.Tasks[j].ParentID; pid != nil && *pid == id {
				fr.Tasks[j].ProjectID = clonePtr(p.ProjectID.Value)
			}
		}
	}
	if p.ParentID.Set {
		t.ParentID = clonePtr(p.ParentID.Value)
	}
	if p.DueDate.Set {
		t.DueDate = clonePtr(p.DueDate.Value)
	}
	if p.ScheduledFor.Set {
		t.ScheduledFor = clonePtr(p.ScheduledFor.Value)
	}
	if p.Note.Set {
		t.Note = clonePtr(p.Note.Value)
	}
	return fr.getTask(id)
}

// DeleteTask удаляет и подзадачи — как ON DELETE CASCADE.
func (fr *FakeRepo) DeleteTask(_ context.Context, id int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	if fr.taskIndex(id) < 0 {
		return model.ErrNotFound
	}
	fr.Tasks = slices.DeleteFunc(fr.Tasks, func(t model.Task) bool {
		return t.ID == id || (t.ParentID != nil && *t.ParentID == id)
	})
	return nil
}

func (fr *FakeRepo) ReorderTasks(_ context.Context, scope TaskFilter, ids []int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	for pos, id := range ids {
		if i := fr.taskIndex(id); i >= 0 && fr.Tasks[i].ParentID == nil && matches(fr.Tasks[i], scope) {
			fr.Tasks[i].Position = pos
		}
	}
	return nil
}

func (fr *FakeRepo) PlanDay(_ context.Context, date model.Date, add, remove []int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	now := fr.now()
	for _, id := range add {
		if i := fr.taskIndex(id); i >= 0 && !fr.Tasks[i].Done && fr.Tasks[i].ParentID == nil {
			fr.Tasks[i].ScheduledFor = &date
			fr.Tasks[i].UpdatedAt = now
		}
	}
	for _, id := range remove {
		if i := fr.taskIndex(id); i >= 0 && eqPtr(fr.Tasks[i].ScheduledFor, date) {
			fr.Tasks[i].ScheduledFor = nil
			fr.Tasks[i].UpdatedAt = now
		}
	}
	return nil
}

func (fr *FakeRepo) DoneActivity(_ context.Context, days DateRange, loc *time.Location) ([]model.DayCount, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	counts := map[model.Date]int{}
	for _, t := range fr.Tasks {
		if !t.Done || t.DoneAt == nil || t.ParentID != nil {
			continue
		}
		d := model.DateOf(t.DoneAt.In(loc))
		if !d.Before(days.From) && !d.After(days.To) {
			counts[d]++
		}
	}
	out := []model.DayCount{}
	for d, n := range counts {
		out = append(out, model.DayCount{Date: d, Done: n})
	}
	slices.SortFunc(out, func(a, b model.DayCount) int { return compareDates(a.Date, b.Date) })
	return out, nil
}

func (fr *FakeRepo) ListProjects(_ context.Context, includeArchived bool, today model.Date) ([]model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	out := []model.Project{}
	for _, p := range fr.Projects {
		if p.Archived && !includeArchived {
			continue
		}
		var c model.ProjectCounts
		for _, t := range fr.Tasks {
			if t.Done || t.ParentID != nil || !eqPtr(t.ProjectID, p.ID) {
				continue
			}
			c.Active++
			if t.DueDate != nil && t.DueDate.Before(today) {
				c.Overdue++
			}
		}
		p.Counts = &c
		out = append(out, p)
	}
	slices.SortStableFunc(out, func(a, b model.Project) int {
		return cmp.Or(cmp.Compare(a.Position, b.Position), cmp.Compare(a.ID, b.ID))
	})
	return out, nil
}

func (fr *FakeRepo) projectIndex(id int) int {
	return slices.IndexFunc(fr.Projects, func(p model.Project) bool { return p.ID == id })
}

func (fr *FakeRepo) GetProject(_ context.Context, id int) (model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.projectIndex(id)
	if i < 0 {
		return model.Project{}, model.ErrProjectNotFound
	}
	return fr.Projects[i], nil
}

func (fr *FakeRepo) CreateProject(_ context.Context, name, color string) (model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	id, pos := 1, 1
	for _, p := range fr.Projects {
		id = max(id, p.ID+1)
		pos = max(pos, p.Position+1)
	}
	p := model.Project{ID: id, Name: name, Color: color, Position: pos, CreatedAt: fr.now()}
	fr.Projects = append(fr.Projects, p)
	return p, nil
}

func (fr *FakeRepo) PatchProject(_ context.Context, id int, patch ProjectPatch) (model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.projectIndex(id)
	if i < 0 {
		return model.Project{}, model.ErrProjectNotFound
	}
	p := &fr.Projects[i]
	if patch.Name != nil {
		p.Name = *patch.Name
	}
	if patch.Color != nil {
		p.Color = *patch.Color
	}
	if patch.Archived != nil {
		p.Archived = *patch.Archived
	}
	return *p, nil
}

// DeleteProject отправляет задачи списка во «Входящие» — как ON DELETE SET NULL.
func (fr *FakeRepo) DeleteProject(_ context.Context, id int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.projectIndex(id)
	if i < 0 {
		return model.ErrProjectNotFound
	}
	fr.Projects = slices.Delete(fr.Projects, i, i+1)
	for j := range fr.Tasks {
		if eqPtr(fr.Tasks[j].ProjectID, id) {
			fr.Tasks[j].ProjectID = nil
		}
	}
	return nil
}

func (fr *FakeRepo) ReorderProjects(_ context.Context, ids []int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	for pos, id := range ids {
		if i := fr.projectIndex(id); i >= 0 {
			fr.Projects[i].Position = pos
		}
	}
	return nil
}

// matches — то же, что filterConds, только в памяти.
func matches(t model.Task, f TaskFilter) bool {
	switch {
	case f.Done != nil && t.Done != *f.Done,
		f.ProjectID != nil && !eqPtr(t.ProjectID, *f.ProjectID),
		f.Inbox && t.ProjectID != nil,
		f.ScheduledOn != nil && !eqPtr(t.ScheduledFor, *f.ScheduledOn),
		f.NotScheduledOn != nil && eqPtr(t.ScheduledFor, *f.NotScheduledOn),
		f.ScheduledBefore != nil && (t.ScheduledFor == nil || !t.ScheduledFor.Before(*f.ScheduledBefore)),
		f.DueBefore != nil && (t.DueDate == nil || !t.DueDate.Before(*f.DueBefore)),
		f.DueBetween != nil && !inRange(t.DueDate, *f.DueBetween),
		f.AnyDateBetween != nil && !inRange(t.DueDate, *f.AnyDateBetween) && !inRange(t.ScheduledFor, *f.AnyDateBetween),
		f.NoDates && (t.DueDate != nil || t.ScheduledFor != nil),
		f.CreatedBetween != nil && !inTimeRange(&t.CreatedAt, *f.CreatedBetween),
		f.DoneBetween != nil && !inTimeRange(t.DoneAt, *f.DoneBetween),
		f.UpdatedBefore != nil && !t.UpdatedAt.Before(*f.UpdatedBefore):
		return false
	}
	return true
}

// compareTasks повторяет orderBy: пустые значения в конце при любом направлении,
// при равенстве — position, id по возрастанию.
func compareTasks(a, b model.Task, sort SortField, desc bool) int {
	dir := func(c int) int {
		if desc {
			return -c
		}
		return c
	}
	tie := cmp.Or(cmp.Compare(a.Position, b.Position), cmp.Compare(a.ID, b.ID))
	var c int
	switch sort {
	case SortPriority:
		c = dir(cmp.Compare(priorityRank(a.Priority), priorityRank(b.Priority)))
	case SortDueDate:
		c = nullsLast(a.DueDate, b.DueDate, func(x, y model.Date) int { return dir(compareDates(x, y)) })
	case SortScheduledFor:
		c = nullsLast(a.ScheduledFor, b.ScheduledFor, func(x, y model.Date) int { return dir(compareDates(x, y)) })
	case SortCreatedAt:
		c = dir(a.CreatedAt.Compare(b.CreatedAt))
	case SortUpdatedAt:
		c = dir(a.UpdatedAt.Compare(b.UpdatedAt))
	case SortDoneAt:
		c = nullsLast(a.DoneAt, b.DoneAt, func(x, y time.Time) int { return dir(x.Compare(y)) })
	default:
		return dir(tie)
	}
	return cmp.Or(c, tie)
}

func priorityRank(p string) int {
	switch p {
	case "high":
		return 1
	case "medium":
		return 2
	default:
		return 3
	}
}

func nullsLast[T any](a, b *T, cmpFn func(x, y T) int) int {
	switch {
	case a == nil && b == nil:
		return 0
	case a == nil:
		return 1
	case b == nil:
		return -1
	}
	return cmpFn(*a, *b)
}

func compareDates(a, b model.Date) int {
	switch {
	case a.Before(b):
		return -1
	case a.After(b):
		return 1
	}
	return 0
}

func inRange(d *model.Date, r DateRange) bool {
	return d != nil && !d.Before(r.From) && !d.After(r.To)
}

func inTimeRange(t *time.Time, r TimeRange) bool {
	return t != nil && !t.Before(r.From) && t.Before(r.To)
}

func eqPtr[T comparable](p *T, v T) bool { return p != nil && *p == v }

func clonePtr[T any](p *T) *T {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}
