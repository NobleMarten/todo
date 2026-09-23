package service

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

var (
	msk = mustLoc("Europe/Moscow")
	d0  = model.NewDate(2026, 9, 21)
)

func mustLoc(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

func ptr[T any](v T) *T { return &v }

func newTaskService() (*TaskService, *storage.FakeRepo) {
	repo := &storage.FakeRepo{}
	return NewTaskService(repo, repo, msk), repo
}

func mustAdd(t *testing.T, s *TaskService, nt storage.NewTask) model.Task {
	t.Helper()
	task, err := s.Add(context.Background(), nt)
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func taskIDs(tasks []model.Task) []int {
	out := []int{}
	for _, t := range tasks {
		out = append(out, t.ID)
	}
	return out
}

func TestValidateTitle(t *testing.T) {
	tests := []struct {
		name, in, want string
		err            error
	}{
		{"empty", "   ", "", model.ErrEmptyTitle},
		{"trimmed", "  купить хлеб  ", "купить хлеб", nil},
		{"too long", strings.Repeat("я", 121), "", model.ErrTitleTooLong},
		{"max length in runes", strings.Repeat("я", 120), strings.Repeat("я", 120), nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ValidateTitle(tt.in)
			if !errors.Is(err, tt.err) || got != tt.want {
				t.Fatalf("ValidateTitle(%q) = %q, %v; want %q, %v", tt.in, got, err, tt.want, tt.err)
			}
		})
	}
}

func TestAdd(t *testing.T) {
	ctx := context.Background()
	s, repo := newTaskService()
	p, _ := repo.CreateProject(ctx, "go", "#6AA6FF")

	task, err := s.Add(ctx, storage.NewTask{Title: "  задача  ", DueDate: &d0})
	if err != nil {
		t.Fatal(err)
	}
	if task.Title != "задача" || task.Priority != "low" || task.DueDate == nil || *task.DueDate != d0 {
		t.Fatalf("task = %+v", task)
	}

	parent := mustAdd(t, s, storage.NewTask{Title: "parent", ProjectID: &p.ID})
	sub := mustAdd(t, s, storage.NewTask{Title: "sub", ParentID: &parent.ID})
	if sub.ProjectID == nil || *sub.ProjectID != p.ID {
		t.Fatalf("подзадача не унаследовала список: %v", sub.ProjectID)
	}

	errCases := []struct {
		name string
		in   storage.NewTask
		err  error
	}{
		{"empty title", storage.NewTask{Title: " "}, model.ErrEmptyTitle},
		{"bad priority", storage.NewTask{Title: "x", Priority: "urgent"}, model.ErrInvalidPriority},
		{"no project", storage.NewTask{Title: "x", ProjectID: ptr(999)}, model.ErrProjectNotFound},
		{"no parent", storage.NewTask{Title: "x", ParentID: ptr(999)}, model.ErrNotFound},
		{"too deep", storage.NewTask{Title: "x", ParentID: &sub.ID}, model.ErrSubtaskTooDeep},
	}
	for _, tc := range errCases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := s.Add(ctx, tc.in); !errors.Is(err, tc.err) {
				t.Fatalf("err = %v, want %v", err, tc.err)
			}
		})
	}
}

func TestGet(t *testing.T) {
	ctx := context.Background()
	s, _ := newTaskService()
	parent := mustAdd(t, s, storage.NewTask{Title: "parent"})
	sub := mustAdd(t, s, storage.NewTask{Title: "sub", ParentID: &parent.ID})

	got, err := s.Get(ctx, parent.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(taskIDs(got.Subtasks), []int{sub.ID}) || *got.SubtaskStats != (model.Stats{Total: 1}) {
		t.Fatalf("subtasks = %v, stats = %+v", taskIDs(got.Subtasks), got.SubtaskStats)
	}

	for _, tc := range []struct {
		id  int
		err error
	}{{0, model.ErrInvalidID}, {-1, model.ErrInvalidID}, {999, model.ErrNotFound}} {
		if _, err := s.Get(ctx, tc.id); !errors.Is(err, tc.err) {
			t.Fatalf("Get(%d) err = %v, want %v", tc.id, err, tc.err)
		}
	}
}

func TestPatch(t *testing.T) {
	ctx := context.Background()
	s, repo := newTaskService()
	p, _ := repo.CreateProject(ctx, "go", "#6AA6FF")
	task := mustAdd(t, s, storage.NewTask{Title: "task", DueDate: &d0})

	t.Run("title trimmed", func(t *testing.T) {
		got, err := s.Patch(ctx, task.ID, storage.TaskPatch{Title: ptr("  new  ")})
		if err != nil || got.Title != "new" {
			t.Fatalf("title = %q, %v", got.Title, err)
		}
	})
	t.Run("null clears, absent keeps", func(t *testing.T) {
		got, err := s.Patch(ctx, task.ID, storage.TaskPatch{
			DueDate:      model.Opt[model.Date]{Set: true},
			ScheduledFor: model.Opt[model.Date]{Set: true, Value: &d0},
		})
		if err != nil || got.DueDate != nil || got.ScheduledFor == nil || got.Title != "new" {
			t.Fatalf("got %+v, %v", got, err)
		}
	})
	t.Run("done then already done", func(t *testing.T) {
		got, err := s.Patch(ctx, task.ID, storage.TaskPatch{Done: ptr(true)})
		if err != nil || !got.Done || got.DoneAt == nil {
			t.Fatalf("done: %+v, %v", got, err)
		}
		if _, err := s.Patch(ctx, task.ID, storage.TaskPatch{Done: ptr(true)}); !errors.Is(err, model.ErrAlreadyDone) {
			t.Fatalf("err = %v, want ErrAlreadyDone", err)
		}
		got, err = s.Patch(ctx, task.ID, storage.TaskPatch{Done: ptr(false)})
		if err != nil || got.Done || got.DoneAt != nil {
			t.Fatalf("undone: %+v, %v", got, err)
		}
		if _, err := s.Patch(ctx, task.ID, storage.TaskPatch{Done: ptr(false)}); !errors.Is(err, model.ErrAlreadyUndone) {
			t.Fatalf("err = %v, want ErrAlreadyUndone", err)
		}
	})

	parent := mustAdd(t, s, storage.NewTask{Title: "parent", ProjectID: &p.ID})
	sub := mustAdd(t, s, storage.NewTask{Title: "sub", ParentID: &parent.ID})
	loose := mustAdd(t, s, storage.NewTask{Title: "loose"})

	t.Run("parent inherits project", func(t *testing.T) {
		got, err := s.Patch(ctx, loose.ID, storage.TaskPatch{ParentID: model.Opt[int]{Set: true, Value: &parent.ID}})
		if err != nil || got.ParentID == nil || *got.ParentID != parent.ID || got.ProjectID == nil || *got.ProjectID != p.ID {
			t.Fatalf("got %+v, %v", got, err)
		}
		// отцепить обратно — снова корневая, список остаётся
		got, err = s.Patch(ctx, loose.ID, storage.TaskPatch{ParentID: model.Opt[int]{Set: true}})
		if err != nil || got.ParentID != nil || got.ProjectID == nil {
			t.Fatalf("detach: %+v, %v", got, err)
		}
	})

	errCases := []struct {
		name  string
		id    int
		patch storage.TaskPatch
		err   error
	}{
		{"invalid id", 0, storage.TaskPatch{Title: ptr("x")}, model.ErrInvalidID},
		{"nothing", task.ID, storage.TaskPatch{}, model.ErrNothingToUpdate},
		{"not found", 999, storage.TaskPatch{Title: ptr("x")}, model.ErrNotFound},
		{"empty title", task.ID, storage.TaskPatch{Title: ptr("  ")}, model.ErrEmptyTitle},
		{"too long title", task.ID, storage.TaskPatch{Title: ptr(strings.Repeat("a", 121))}, model.ErrTitleTooLong},
		{"bad priority", task.ID, storage.TaskPatch{Priority: ptr("x")}, model.ErrInvalidPriority},
		{"no project", task.ID, storage.TaskPatch{ProjectID: model.Opt[int]{Set: true, Value: ptr(999)}}, model.ErrProjectNotFound},
		{"parent is self", task.ID, storage.TaskPatch{ParentID: model.Opt[int]{Set: true, Value: &task.ID}}, model.ErrSubtaskTooDeep},
		{"parent is subtask", task.ID, storage.TaskPatch{ParentID: model.Opt[int]{Set: true, Value: &sub.ID}}, model.ErrSubtaskTooDeep},
		{"task has subtasks", parent.ID, storage.TaskPatch{ParentID: model.Opt[int]{Set: true, Value: &task.ID}}, model.ErrSubtaskTooDeep},
		{"no parent", task.ID, storage.TaskPatch{ParentID: model.Opt[int]{Set: true, Value: ptr(999)}}, model.ErrNotFound},
		{"subtask own project", sub.ID, storage.TaskPatch{ProjectID: model.Opt[int]{Set: true}}, model.ErrInvalidBody},
		{"id out of int4", 1 << 40, storage.TaskPatch{Title: ptr("x")}, model.ErrInvalidID},
		{"project id out of int4", task.ID, storage.TaskPatch{ProjectID: model.Opt[int]{Set: true, Value: ptr(1 << 40)}}, model.ErrProjectNotFound},
	}
	for _, tc := range errCases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := s.Patch(ctx, tc.id, tc.patch); !errors.Is(err, tc.err) {
				t.Fatalf("err = %v, want %v", err, tc.err)
			}
		})
	}
}

func TestDelete(t *testing.T) {
	ctx := context.Background()
	s, _ := newTaskService()
	task := mustAdd(t, s, storage.NewTask{Title: "x"})

	tests := []struct {
		name string
		id   int
		err  error
	}{
		{"invalid id", 0, model.ErrInvalidID},
		{"ok", task.ID, nil},
		{"already deleted", task.ID, model.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := s.Delete(ctx, tt.id); !errors.Is(err, tt.err) {
				t.Fatalf("err = %v, want %v", err, tt.err)
			}
		})
	}
}

func TestList_Views(t *testing.T) {
	ctx := context.Background()
	s, repo := newTaskService()
	p, _ := repo.CreateProject(ctx, "go", "#6AA6FF")

	today := mustAdd(t, s, storage.NewTask{Title: "today", ScheduledFor: &d0, ProjectID: &p.ID})
	overdue := mustAdd(t, s, storage.NewTask{Title: "overdue", DueDate: ptr(d0.AddDays(-1))})
	week := mustAdd(t, s, storage.NewTask{Title: "week", DueDate: ptr(d0.AddDays(7))})
	later := mustAdd(t, s, storage.NewTask{Title: "later", ScheduledFor: ptr(d0.AddDays(8)), ProjectID: &p.ID})
	done1 := mustAdd(t, s, storage.NewTask{Title: "done1"})
	done2 := mustAdd(t, s, storage.NewTask{Title: "done2"})
	mustAdd(t, s, storage.NewTask{Title: "sub", ParentID: &today.ID, ScheduledFor: &d0})
	for _, id := range []int{done1.ID, done2.ID} {
		if _, err := s.Patch(ctx, id, storage.TaskPatch{Done: ptr(true)}); err != nil {
			t.Fatal(err)
		}
	}
	// done2 выполнена позже done1
	repo.Tasks[done1.ID-1].DoneAt = ptr(time.Now().Add(-time.Hour))

	tests := []struct {
		name string
		q    ListQuery
		want []int
	}{
		{"default is all", ListQuery{Today: &d0}, []int{today.ID, overdue.ID, week.ID, later.ID}},
		{"today", ListQuery{View: "today", Today: &d0}, []int{today.ID}},
		{"week", ListQuery{View: "week", Today: &d0}, []int{today.ID, week.ID}},
		{"overdue", ListQuery{View: "overdue", Today: &d0}, []int{overdue.ID}},
		{"inbox", ListQuery{View: "inbox", Today: &d0}, []int{overdue.ID, week.ID}},
		{"project", ListQuery{View: "project", ProjectID: &p.ID}, []int{today.ID, later.ID}},
		{"archive newest first", ListQuery{View: "archive"}, []int{done2.ID, done1.ID}},
		{"done override", ListQuery{View: "all", Done: ptr(true)}, []int{done1.ID, done2.ID}},
		{"project_id narrows any view", ListQuery{View: "week", ProjectID: &p.ID, Today: &d0}, []int{today.ID}},
		{"sort desc", ListQuery{Sort: "due_date", Order: "desc", Today: &d0}, []int{week.ID, overdue.ID, today.ID, later.ID}},
		{"page", ListQuery{Limit: 2, Offset: 1}, []int{overdue.ID, week.ID}},
		{"offset without limit", ListQuery{Offset: 3}, []int{later.ID}},
		{"created range", ListQuery{From: ptr(model.Today(msk).AddDays(-1)), To: ptr(model.Today(msk))}, []int{today.ID, overdue.ID, week.ID, later.ID}},
		{"created range in past", ListQuery{From: &d0, To: &d0}, []int{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			items, total, err := s.List(ctx, tt.q)
			if err != nil {
				t.Fatal(err)
			}
			if got := taskIDs(items); !slices.Equal(got, tt.want) {
				t.Fatalf("ids = %v, want %v", got, tt.want)
			}
			if tt.q.Limit == 0 && tt.q.Offset == 0 && total != len(tt.want) {
				t.Fatalf("total = %d, want %d", total, len(tt.want))
			}
		})
	}

	t.Run("total before pagination", func(t *testing.T) {
		_, total, err := s.List(ctx, ListQuery{Limit: 1})
		if err != nil || total != 4 {
			t.Fatalf("total = %d, %v; want 4", total, err)
		}
	})
}

func TestList_Errors(t *testing.T) {
	s, _ := newTaskService()
	tests := []struct {
		name string
		q    ListQuery
		err  error
	}{
		{"unknown view", ListQuery{View: "someday"}, model.ErrInvalidView},
		{"project without id", ListQuery{View: "project"}, model.ErrInvalidQuery},
		{"project not found", ListQuery{View: "project", ProjectID: ptr(999)}, model.ErrProjectNotFound},
		{"bad sort", ListQuery{Sort: "title"}, model.ErrInvalidQuery},
		{"bad order", ListQuery{Order: "up"}, model.ErrInvalidQuery},
		{"from without to", ListQuery{From: &d0}, model.ErrInvalidQuery},
		{"from after to", ListQuery{From: ptr(d0.AddDays(1)), To: &d0}, model.ErrInvalidQuery},
		{"negative limit", ListQuery{Limit: -1}, model.ErrInvalidQuery},
		{"project_id out of int4", ListQuery{ProjectID: ptr(1 << 40)}, model.ErrInvalidQuery},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, _, err := s.List(context.Background(), tt.q); !errors.Is(err, tt.err) {
				t.Fatalf("err = %v, want %v", err, tt.err)
			}
		})
	}
}

func TestList_ArchiveIsPaged(t *testing.T) {
	ctx := context.Background()
	s, _ := newTaskService()
	for range archiveLimit + 5 {
		task := mustAdd(t, s, storage.NewTask{Title: "x"})
		if _, err := s.Patch(ctx, task.ID, storage.TaskPatch{Done: ptr(true)}); err != nil {
			t.Fatal(err)
		}
	}
	items, total, err := s.List(ctx, ListQuery{View: "archive"})
	if err != nil || len(items) != archiveLimit || total != archiveLimit+5 {
		t.Fatalf("len = %d, total = %d, %v", len(items), total, err)
	}
	items, _, _ = s.List(ctx, ListQuery{View: "archive", Limit: 1000})
	if len(items) != archiveLimit+5 {
		t.Fatalf("limit 1000 → %d задач", len(items))
	}
}

func TestReorder(t *testing.T) {
	ctx := context.Background()
	s, repo := newTaskService()
	a := mustAdd(t, s, storage.NewTask{Title: "a", ScheduledFor: &d0})
	b := mustAdd(t, s, storage.NewTask{Title: "b", ScheduledFor: &d0})
	c := mustAdd(t, s, storage.NewTask{Title: "c"})

	// повтор id не сбивает порядок: берётся первое вхождение
	if err := s.Reorder(ctx, ReorderScope{Type: "day", Date: &d0}, []int{b.ID, c.ID, b.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	items, _, _ := s.List(ctx, ListQuery{View: "today", Today: &d0})
	if got := taskIDs(items); !slices.Equal(got, []int{b.ID, a.ID}) {
		t.Fatalf("order = %v", got)
	}
	if repo.Tasks[c.ID-1].Position != c.Position {
		t.Fatal("задача вне scope поменяла position")
	}

	for _, scope := range []ReorderScope{{Type: "week"}, {Type: "project"}, {Type: "day"}} {
		if err := s.Reorder(ctx, scope, []int{a.ID}); !errors.Is(err, model.ErrInvalidBody) {
			t.Fatalf("scope %+v: err = %v", scope, err)
		}
	}
	if err := s.Reorder(ctx, ReorderScope{Type: "inbox"}, nil); err != nil {
		t.Fatalf("пустой ids: %v", err)
	}
}

func TestActivity(t *testing.T) {
	ctx := context.Background()
	s, repo := newTaskService()
	at := func(s string) *time.Time {
		ts, _ := time.Parse(time.RFC3339, s)
		return &ts
	}
	repo.Tasks = []model.Task{
		{ID: 1, Done: true, DoneAt: at("2026-09-20T22:30:00Z")}, // 21.09 по Москве
		{ID: 2, Done: true, DoneAt: at("2026-09-21T10:00:00Z")},
		{ID: 3, Done: true, DoneAt: at("2025-01-01T10:00:00Z")}, // вне года по умолчанию
		{ID: 4, Done: false},
		{ID: 5, Done: true, ParentID: ptr(2), DoneAt: at("2026-09-21T11:00:00Z")}, // подзадачи не считаются
	}
	got, err := s.Activity(ctx, nil, &d0)
	if err != nil {
		t.Fatal(err)
	}
	if want := []model.DayCount{{Date: d0, Done: 2}}; !slices.Equal(got, want) {
		t.Fatalf("activity = %+v, want %+v", got, want)
	}
	if _, err := s.Activity(ctx, ptr(d0.AddDays(1)), &d0); !errors.Is(err, model.ErrInvalidQuery) {
		t.Fatalf("from > to: %v", err)
	}
}

func TestClear(t *testing.T) {
	s, repo := newTaskService()
	mustAdd(t, s, storage.NewTask{Title: "x"})
	if err := s.Clear(context.Background()); err != nil || len(repo.Tasks) != 0 {
		t.Fatalf("clear: %v, left %d", err, len(repo.Tasks))
	}
}
