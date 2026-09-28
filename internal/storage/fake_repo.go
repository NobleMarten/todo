package storage

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"time"
	"todo/internal/model"
)

// FakeRepo — хранилище в памяти для тестов сервиса и хендлеров.
// Повторяет семантику PostgresRepo: те же условия TaskFilter, та же сортировка,
// каскад подзадач при удалении и переносе в другой список.
// Задачи и списки разных пользователей лежат вместе и различаются по UserID — как в базе.
type FakeRepo struct {
	mu       sync.Mutex
	Tasks    []model.Task
	Projects []model.Project
	Users    []model.User
	Sessions []FakeSession
	Now      func() time.Time // по умолчанию time.Now; тесты подменяют, чтобы зафиксировать время
}

// FakeSession — строка таблицы sessions.
type FakeSession struct {
	TokenHash []byte
	UserID    int
	Expires   time.Time
}

var (
	_ TaskRepo    = (*FakeRepo)(nil)
	_ ProjectRepo = (*FakeRepo)(nil)
	_ UserRepo    = (*FakeRepo)(nil)
)

// errForeignRef — то, что в Postgres сделали бы составные внешние ключи (миграция 00008):
// задачу нельзя положить в чужой список или сделать подзадачей чужой задачи.
var errForeignRef = errors.New("fake: reference to another user's row violates foreign key")

func (fr *FakeRepo) now() time.Time {
	if fr.Now != nil {
		return fr.Now()
	}
	return time.Now()
}

// taskIndex ищет задачу пользователя: чужая для него не существует.
func (fr *FakeRepo) taskIndex(userID, id int) int {
	return slices.IndexFunc(fr.Tasks, func(t model.Task) bool { return t.ID == id && t.UserID == userID })
}

// checkRefs — список и родитель должны принадлежать тому же пользователю (внешние ключи в базе).
func (fr *FakeRepo) checkRefs(userID int, projectID, parentID *int) error {
	if projectID != nil && fr.projectIndex(userID, *projectID) < 0 {
		return errForeignRef
	}
	if parentID != nil && fr.taskIndex(userID, *parentID) < 0 {
		return errForeignRef
	}
	return nil
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

func (fr *FakeRepo) CreateTask(_ context.Context, userID int, nt NewTask) (model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	if err := fr.checkRefs(userID, nt.ProjectID, nt.ParentID); err != nil {
		return model.Task{}, err
	}
	id, pos := 1, 1
	for _, t := range fr.Tasks {
		id = max(id, t.ID+1)
		if t.UserID == userID {
			pos = max(pos, t.Position+1)
		}
	}
	now := fr.now()
	task := model.Task{
		ID:           id,
		UserID:       userID,
		Title:        nt.Title,
		Priority:     nt.Priority,
		ProjectID:    clonePtr(nt.ProjectID),
		ParentID:     clonePtr(nt.ParentID),
		DueDate:      clonePtr(nt.DueDate),
		ScheduledFor: clonePtr(nt.ScheduledFor),
		Note:         clonePtr(nt.Note),
		Repeat:       clonePtr(nt.Repeat),
		Position:     pos,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	fr.Tasks = append(fr.Tasks, task)
	task.SubtaskStats = &model.Stats{}
	return task, nil
}

func (fr *FakeRepo) GetTask(_ context.Context, userID, id int) (model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()
	return fr.getTask(userID, id)
}

func (fr *FakeRepo) getTask(userID, id int) (model.Task, error) {
	i := fr.taskIndex(userID, id)
	if i < 0 {
		return model.Task{}, model.ErrNotFound
	}
	task := fr.Tasks[i]
	task.SubtaskStats = fr.stats(id)
	return task, nil
}

func (fr *FakeRepo) ListTasks(_ context.Context, userID int, q TaskQuery) ([]model.Task, int, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	items := []model.Task{}
	for _, t := range fr.Tasks {
		if t.UserID == userID && t.ParentID == nil && matches(t, q.Filter) {
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

func (fr *FakeRepo) Subtasks(_ context.Context, userID, parentID int) ([]model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	subs := []model.Task{}
	for _, t := range fr.Tasks {
		if t.UserID == userID && t.ParentID != nil && *t.ParentID == parentID {
			subs = append(subs, t)
		}
	}
	slices.SortStableFunc(subs, func(a, b model.Task) int { return compareTasks(a, b, SortPosition, false) })
	return subs, nil
}

func (fr *FakeRepo) PatchTask(_ context.Context, userID, id int, p TaskPatch) (model.Task, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.taskIndex(userID, id)
	if i < 0 {
		return model.Task{}, model.ErrNotFound
	}
	var projectID, parentID *int
	if p.ProjectID.Set {
		projectID = p.ProjectID.Value
	}
	if p.ParentID.Set {
		parentID = p.ParentID.Value
	}
	if err := fr.checkRefs(userID, projectID, parentID); err != nil {
		return model.Task{}, err
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
			if pid := fr.Tasks[j].ParentID; pid != nil && *pid == id && fr.Tasks[j].UserID == userID {
				fr.Tasks[j].ProjectID = clonePtr(p.ProjectID.Value)
			}
		}
	}
	if p.ParentID.Set {
		t.ParentID = clonePtr(p.ParentID.Value)
	}
	if (p.DueDate.Set && movedLater(t.DueDate, p.DueDate.Value)) ||
		(p.ScheduledFor.Set && movedLater(t.ScheduledFor, p.ScheduledFor.Value)) {
		t.Postponed++
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
	if p.Repeat.Set {
		t.Repeat = clonePtr(p.Repeat.Value)
	}
	return fr.getTask(userID, id)
}

// DeleteTask удаляет и подзадачи — как ON DELETE CASCADE.
func (fr *FakeRepo) DeleteTask(_ context.Context, userID, id int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	if fr.taskIndex(userID, id) < 0 {
		return model.ErrNotFound
	}
	fr.Tasks = slices.DeleteFunc(fr.Tasks, func(t model.Task) bool {
		return t.UserID == userID && (t.ID == id || (t.ParentID != nil && *t.ParentID == id))
	})
	return nil
}

func (fr *FakeRepo) ReorderTasks(_ context.Context, userID int, scope TaskFilter, ids []int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	for pos, id := range ids {
		if i := fr.taskIndex(userID, id); i >= 0 && fr.Tasks[i].ParentID == nil && matches(fr.Tasks[i], scope) {
			fr.Tasks[i].Position = pos
		}
	}
	return nil
}

func (fr *FakeRepo) PlanDay(_ context.Context, userID int, date model.Date, add, remove []int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	now := fr.now()
	for _, id := range add {
		if i := fr.taskIndex(userID, id); i >= 0 && !fr.Tasks[i].Done && fr.Tasks[i].ParentID == nil {
			if movedLater(fr.Tasks[i].ScheduledFor, &date) {
				fr.Tasks[i].Postponed++
			}
			fr.Tasks[i].ScheduledFor = &date
			fr.Tasks[i].UpdatedAt = now
		}
	}
	for _, id := range remove {
		if i := fr.taskIndex(userID, id); i >= 0 && eqPtr(fr.Tasks[i].ScheduledFor, date) {
			fr.Tasks[i].ScheduledFor = nil
			fr.Tasks[i].UpdatedAt = now
		}
	}
	return nil
}

func (fr *FakeRepo) DoneActivity(_ context.Context, userID int, days DateRange, loc *time.Location) ([]model.DayCount, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	counts := map[model.Date]int{}
	for _, t := range fr.Tasks {
		if t.UserID != userID || !t.Done || t.DoneAt == nil || t.ParentID != nil {
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

func (fr *FakeRepo) ListProjects(_ context.Context, userID int, includeArchived bool, today model.Date) ([]model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	out := []model.Project{}
	for _, p := range fr.Projects {
		if p.UserID != userID || (p.Archived && !includeArchived) {
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

func (fr *FakeRepo) projectIndex(userID, id int) int {
	return slices.IndexFunc(fr.Projects, func(p model.Project) bool { return p.ID == id && p.UserID == userID })
}

func (fr *FakeRepo) GetProject(_ context.Context, userID, id int) (model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.projectIndex(userID, id)
	if i < 0 {
		return model.Project{}, model.ErrProjectNotFound
	}
	return fr.Projects[i], nil
}

func (fr *FakeRepo) CreateProject(_ context.Context, userID int, name, color string) (model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	id, pos := 1, 1
	for _, p := range fr.Projects {
		id = max(id, p.ID+1)
		if p.UserID == userID {
			pos = max(pos, p.Position+1)
		}
	}
	p := model.Project{ID: id, UserID: userID, Name: name, Color: color, Position: pos, CreatedAt: fr.now()}
	fr.Projects = append(fr.Projects, p)
	return p, nil
}

func (fr *FakeRepo) PatchProject(_ context.Context, userID, id int, patch ProjectPatch) (model.Project, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.projectIndex(userID, id)
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
func (fr *FakeRepo) DeleteProject(_ context.Context, userID, id int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.projectIndex(userID, id)
	if i < 0 {
		return model.ErrProjectNotFound
	}
	fr.Projects = slices.Delete(fr.Projects, i, i+1)
	for j := range fr.Tasks {
		if fr.Tasks[j].UserID == userID && eqPtr(fr.Tasks[j].ProjectID, id) {
			fr.Tasks[j].ProjectID = nil
		}
	}
	return nil
}

func (fr *FakeRepo) ReorderProjects(_ context.Context, userID int, ids []int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	for pos, id := range ids {
		if i := fr.projectIndex(userID, id); i >= 0 {
			fr.Projects[i].Position = pos
		}
	}
	return nil
}

// ── пользователи и сессии ──────────────────────────────────────────────────────

func (fr *FakeRepo) CreateUser(_ context.Context, login, passwordHash string) (model.User, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	id := 1
	for _, u := range fr.Users {
		if u.Login == login {
			return model.User{}, model.ErrLoginTaken
		}
		id = max(id, u.ID+1)
	}
	u := model.User{ID: id, Login: login, PasswordHash: passwordHash, CreatedAt: fr.now()}
	fr.Users = append(fr.Users, u)
	return u, nil
}

func (fr *FakeRepo) UserByLogin(_ context.Context, login string) (model.User, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	for _, u := range fr.Users {
		if u.Login == login {
			return u, nil
		}
	}
	return model.User{}, model.ErrUserNotFound
}

func (fr *FakeRepo) SetPassword(_ context.Context, userID int, passwordHash string) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	for i := range fr.Users {
		if fr.Users[i].ID == userID {
			fr.Users[i].PasswordHash = passwordHash
			return nil
		}
	}
	return model.ErrUserNotFound
}

func (fr *FakeRepo) ListUsers(_ context.Context) ([]model.User, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()
	return slices.Clone(fr.Users), nil
}

func (fr *FakeRepo) CreateSession(_ context.Context, userID int, tokenHash []byte, expires time.Time) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	now := fr.now()
	fr.Sessions = slices.DeleteFunc(fr.Sessions, func(s FakeSession) bool { return !s.Expires.After(now) })
	fr.Sessions = append(fr.Sessions, FakeSession{TokenHash: slices.Clone(tokenHash), UserID: userID, Expires: expires})
	return nil
}

func (fr *FakeRepo) sessionIndex(tokenHash []byte) int {
	return slices.IndexFunc(fr.Sessions, func(s FakeSession) bool { return bytes.Equal(s.TokenHash, tokenHash) })
}

func (fr *FakeRepo) SessionUser(_ context.Context, tokenHash []byte, now time.Time) (model.User, time.Time, error) {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	i := fr.sessionIndex(tokenHash)
	if i < 0 || !fr.Sessions[i].Expires.After(now) {
		return model.User{}, time.Time{}, model.ErrUnauthorized
	}
	s := fr.Sessions[i]
	for _, u := range fr.Users {
		if u.ID == s.UserID {
			return u, s.Expires, nil
		}
	}
	return model.User{}, time.Time{}, model.ErrUnauthorized
}

func (fr *FakeRepo) ExtendSession(_ context.Context, tokenHash []byte, expires time.Time) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	if i := fr.sessionIndex(tokenHash); i >= 0 {
		fr.Sessions[i].Expires = expires
	}
	return nil
}

func (fr *FakeRepo) DeleteSession(_ context.Context, tokenHash []byte) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	fr.Sessions = slices.DeleteFunc(fr.Sessions, func(s FakeSession) bool { return bytes.Equal(s.TokenHash, tokenHash) })
	return nil
}

func (fr *FakeRepo) DeleteUserSessions(_ context.Context, userID int) error {
	fr.mu.Lock()
	defer fr.mu.Unlock()

	fr.Sessions = slices.DeleteFunc(fr.Sessions, func(s FakeSession) bool { return s.UserID == userID })
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
		f.UpdatedBefore != nil && !t.UpdatedAt.Before(*f.UpdatedBefore),
		f.Search != "" && !containsFold(t.Title, f.Search) && (t.Note == nil || !containsFold(*t.Note, f.Search)):
		return false
	}
	return true
}

func containsFold(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
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

// movedLater — перенос: дата стояла и сдвигается на более позднюю (как «old < new» в SQL, где NULL — не перенос).
func movedLater(old, next *model.Date) bool {
	return old != nil && next != nil && old.Before(*next)
}

func eqPtr[T comparable](p *T, v T) bool { return p != nil && *p == v }

func clonePtr[T any](p *T) *T {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}
