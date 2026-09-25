package storage

import (
	"context"
	"slices"
	"testing"
	"time"
	"todo/internal/model"
)

// Один и тот же сценарий гоняется на FakeRepo и на PostgresRepo: так тесты сервиса
// на фейке проверяют то же поведение, что и SQL. Postgres — только при TEST_DB_URL.

type fullRepo interface {
	TaskRepo
	ProjectRepo
}

func TestRepoContract_Fake(t *testing.T) {
	runContract(t, func(t *testing.T) fullRepo { return &FakeRepo{} })
}

func TestRepoContract_Postgres(t *testing.T) {
	runContract(t, func(t *testing.T) fullRepo {
		db := openTestSchema(t)
		if err := Migrate(db); err != nil {
			t.Fatal(err)
		}
		return NewPostgresRepo(db)
	})
}

var d0 = model.NewDate(2026, 9, 21)

func ptr[T any](v T) *T { return &v }

func mustCreate(t *testing.T, r fullRepo, nt NewTask) model.Task {
	t.Helper()
	if nt.Priority == "" {
		nt.Priority = "low"
	}
	task, err := r.CreateTask(t.Context(), nt)
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func ids(tasks []model.Task) []int {
	out := make([]int, len(tasks))
	for i, t := range tasks {
		out[i] = t.ID
	}
	return out
}

func runContract(t *testing.T, newRepo func(t *testing.T) fullRepo) {
	t.Run("filters and sort", func(t *testing.T) {
		r := newRepo(t)
		ctx := t.Context()
		p, err := r.CreateProject(ctx, "go", "#6AA6FF")
		if err != nil {
			t.Fatal(err)
		}

		today := mustCreate(t, r, NewTask{Title: "today", ScheduledFor: &d0, ProjectID: &p.ID, Priority: "high"})
		overdue := mustCreate(t, r, NewTask{Title: "overdue", DueDate: ptr(d0.AddDays(-2))})
		carry := mustCreate(t, r, NewTask{Title: "carry", ScheduledFor: ptr(d0.AddDays(-1)), Priority: "medium"})
		soon := mustCreate(t, r, NewTask{Title: "soon", DueDate: ptr(d0.AddDays(7)), ProjectID: &p.ID})
		later := mustCreate(t, r, NewTask{Title: "later", DueDate: ptr(d0.AddDays(8))})
		plain := mustCreate(t, r, NewTask{Title: "plain"})
		sub := mustCreate(t, r, NewTask{Title: "sub", ParentID: &plain.ID, ScheduledFor: &d0})
		done := mustCreate(t, r, NewTask{Title: "done", ScheduledFor: &d0})
		if _, err := r.PatchTask(ctx, done.ID, TaskPatch{Done: ptr(true)}); err != nil {
			t.Fatal(err)
		}
		if _, err := r.PatchTask(ctx, sub.ID, TaskPatch{Done: ptr(true)}); err != nil {
			t.Fatal(err)
		}

		f := false
		future := time.Now().Add(time.Hour)
		cases := []struct {
			name string
			q    TaskQuery
			want []int
		}{
			{"all roots", TaskQuery{}, []int{today.ID, overdue.ID, carry.ID, soon.ID, later.ID, plain.ID, done.ID}},
			{"not done", TaskQuery{Filter: TaskFilter{Done: &f}}, []int{today.ID, overdue.ID, carry.ID, soon.ID, later.ID, plain.ID}},
			{"scheduled on", TaskQuery{Filter: TaskFilter{Done: &f, ScheduledOn: &d0}}, []int{today.ID}},
			{"not scheduled on", TaskQuery{Filter: TaskFilter{Done: &f, NotScheduledOn: &d0}}, []int{overdue.ID, carry.ID, soon.ID, later.ID, plain.ID}},
			{"scheduled before", TaskQuery{Filter: TaskFilter{ScheduledBefore: &d0}}, []int{carry.ID}},
			{"due before", TaskQuery{Filter: TaskFilter{DueBefore: &d0}}, []int{overdue.ID}},
			{"due between", TaskQuery{Filter: TaskFilter{DueBetween: &DateRange{d0, d0.AddDays(7)}}}, []int{soon.ID}},
			{"week", TaskQuery{Filter: TaskFilter{Done: &f, AnyDateBetween: &DateRange{d0, d0.AddDays(7)}}}, []int{today.ID, soon.ID}},
			{"project", TaskQuery{Filter: TaskFilter{ProjectID: &p.ID}}, []int{today.ID, soon.ID}},
			{"inbox", TaskQuery{Filter: TaskFilter{Done: &f, Inbox: true}}, []int{overdue.ID, carry.ID, later.ID, plain.ID}},
			{"no dates", TaskQuery{Filter: TaskFilter{NoDates: true}}, []int{plain.ID}},
			{"updated before future", TaskQuery{Filter: TaskFilter{NoDates: true, UpdatedBefore: &future}}, []int{plain.ID}},
			{"updated before d0", TaskQuery{Filter: TaskFilter{UpdatedBefore: ptr(d0.Time(time.UTC))}}, []int{}},
			{"done between", TaskQuery{Filter: TaskFilter{DoneBetween: &TimeRange{time.Now().Add(-time.Hour), future}}}, []int{done.ID}},
			{"created between", TaskQuery{Filter: TaskFilter{CreatedBetween: &TimeRange{time.Now().Add(-time.Hour), future}, Inbox: true, NoDates: true}}, []int{plain.ID}},
			{"sort due_date asc, nulls last", TaskQuery{Filter: TaskFilter{Done: &f}, Sort: SortDueDate}, []int{overdue.ID, soon.ID, later.ID, today.ID, carry.ID, plain.ID}},
			{"sort due_date desc, nulls last", TaskQuery{Filter: TaskFilter{Done: &f}, Sort: SortDueDate, Desc: true}, []int{later.ID, soon.ID, overdue.ID, today.ID, carry.ID, plain.ID}},
			{"sort priority", TaskQuery{Filter: TaskFilter{Done: &f}, Sort: SortPriority}, []int{today.ID, carry.ID, overdue.ID, soon.ID, later.ID, plain.ID}},
			{"position desc", TaskQuery{Filter: TaskFilter{Inbox: true, Done: &f}, Desc: true}, []int{plain.ID, later.ID, carry.ID, overdue.ID}},
			{"page", TaskQuery{Filter: TaskFilter{Done: &f}, Limit: 2, Offset: 1}, []int{overdue.ID, carry.ID}},
			{"page past end", TaskQuery{Filter: TaskFilter{Done: &f}, Limit: 2, Offset: 50}, []int{}},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				items, total, err := r.ListTasks(ctx, tc.q)
				if err != nil {
					t.Fatal(err)
				}
				if got := ids(items); !slices.Equal(got, tc.want) {
					t.Fatalf("ids = %v, want %v", got, tc.want)
				}
				if tc.q.Limit == 0 && total != len(tc.want) {
					t.Fatalf("total = %d, want %d", total, len(tc.want))
				}
			})
		}

		_, total, err := r.ListTasks(ctx, TaskQuery{Filter: TaskFilter{Done: &f}, Limit: 2})
		if err != nil || total != 6 {
			t.Fatalf("total до пагинации = %d, %v; want 6", total, err)
		}

		// прогресс подзадач у корня
		items, _, err := r.ListTasks(ctx, TaskQuery{Filter: TaskFilter{NoDates: true}})
		if err != nil {
			t.Fatal(err)
		}
		if s := items[0].SubtaskStats; s == nil || *s != (model.Stats{Done: 1, Total: 1}) {
			t.Fatalf("subtask_stats = %+v, want {1 1}", s)
		}

		projects, err := r.ListProjects(ctx, false, d0)
		if err != nil {
			t.Fatal(err)
		}
		i := slices.IndexFunc(projects, func(x model.Project) bool { return x.ID == p.ID })
		if i < 0 || *projects[i].Counts != (model.ProjectCounts{Active: 2, Overdue: 0}) {
			t.Fatalf("counts = %+v", projects)
		}
		projects, _ = r.ListProjects(ctx, false, d0.AddDays(8))
		i = slices.IndexFunc(projects, func(x model.Project) bool { return x.ID == p.ID })
		if projects[i].Counts.Overdue != 1 {
			t.Fatalf("overdue на d0+8 = %d, want 1", projects[i].Counts.Overdue)
		}
	})

	t.Run("patch three states", func(t *testing.T) {
		r := newRepo(t)
		ctx := t.Context()
		task := mustCreate(t, r, NewTask{Title: "x", DueDate: &d0, ScheduledFor: &d0})
		created := task.UpdatedAt

		// ключ отсутствует — поле не трогаем; null — очищаем
		got, err := r.PatchTask(ctx, task.ID, TaskPatch{
			DueDate: model.Opt[model.Date]{Set: true},
			Note:    model.Opt[string]{Set: true, Value: ptr("заметка")},
		})
		if err != nil {
			t.Fatal(err)
		}
		if got.DueDate != nil {
			t.Fatalf("due_date = %v, want null", got.DueDate)
		}
		if got.ScheduledFor == nil || *got.ScheduledFor != d0 {
			t.Fatalf("scheduled_for = %v, want не тронут", got.ScheduledFor)
		}
		if got.Note == nil || *got.Note != "заметка" {
			t.Fatalf("note = %v", got.Note)
		}
		if got.UpdatedAt.Before(created) {
			t.Fatal("updated_at не обновился")
		}

		got, err = r.PatchTask(ctx, task.ID, TaskPatch{Done: ptr(true)})
		if err != nil || !got.Done || got.DoneAt == nil {
			t.Fatalf("done: %+v, %v", got, err)
		}
		got, err = r.PatchTask(ctx, task.ID, TaskPatch{Done: ptr(false)})
		if err != nil || got.Done || got.DoneAt != nil {
			t.Fatalf("undone: %+v, %v", got, err)
		}
		if got.Note == nil {
			t.Fatal("note стёрся PATCH-ем без этого ключа")
		}

		// null в полях-указателях (не датах) тоже доходит до базы как NULL
		p, _ := r.CreateProject(ctx, "p", "#000000")
		if _, err := r.PatchTask(ctx, task.ID, TaskPatch{ProjectID: model.Opt[int]{Set: true, Value: &p.ID}}); err != nil {
			t.Fatal(err)
		}
		got, err = r.PatchTask(ctx, task.ID, TaskPatch{
			ProjectID: model.Opt[int]{Set: true},
			Note:      model.Opt[string]{Set: true},
		})
		if err != nil || got.ProjectID != nil || got.Note != nil {
			t.Fatalf("null project_id/note: %+v, %v", got, err)
		}

		if _, err := r.PatchTask(ctx, 9999, TaskPatch{Title: ptr("y")}); err != model.ErrNotFound {
			t.Fatalf("err = %v, want ErrNotFound", err)
		}
	})

	t.Run("repeat and note on create", func(t *testing.T) {
		r := newRepo(t)
		ctx := t.Context()
		task := mustCreate(t, r, NewTask{Title: "зарядка", ScheduledFor: &d0, Note: ptr("10 мин"), Repeat: ptr("daily")})
		if task.Repeat == nil || *task.Repeat != "daily" || task.Note == nil || *task.Note != "10 мин" {
			t.Fatalf("create: repeat %v note %v", task.Repeat, task.Note)
		}
		got, err := r.PatchTask(ctx, task.ID, TaskPatch{Repeat: model.Opt[string]{Set: true, Value: ptr("weekly:1,4")}})
		if err != nil || got.Repeat == nil || *got.Repeat != "weekly:1,4" {
			t.Fatalf("patch repeat: %v, %v", got.Repeat, err)
		}
		got, err = r.PatchTask(ctx, task.ID, TaskPatch{Repeat: model.Opt[string]{Set: true}})
		if err != nil || got.Repeat != nil {
			t.Fatalf("null repeat: %v, %v", got.Repeat, err)
		}
		plain := mustCreate(t, r, NewTask{Title: "обычная"})
		if plain.Repeat != nil || plain.Note != nil {
			t.Fatalf("без repeat/note: %v %v", plain.Repeat, plain.Note)
		}
	})

	t.Run("subtasks follow parent", func(t *testing.T) {
		r := newRepo(t)
		ctx := t.Context()
		p, _ := r.CreateProject(ctx, "a", "#000000")
		parent := mustCreate(t, r, NewTask{Title: "parent"})
		s1 := mustCreate(t, r, NewTask{Title: "s1", ParentID: &parent.ID})
		s2 := mustCreate(t, r, NewTask{Title: "s2", ParentID: &parent.ID})

		if _, err := r.PatchTask(ctx, parent.ID, TaskPatch{ProjectID: model.Opt[int]{Set: true, Value: &p.ID}}); err != nil {
			t.Fatal(err)
		}
		subs, err := r.Subtasks(ctx, parent.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !slices.Equal(ids(subs), []int{s1.ID, s2.ID}) {
			t.Fatalf("subtasks = %v", ids(subs))
		}
		for _, s := range subs {
			if s.ProjectID == nil || *s.ProjectID != p.ID {
				t.Fatalf("подзадача %d не переехала: %v", s.ID, s.ProjectID)
			}
		}

		// удаление списка — задачи во «Входящие»
		if err := r.DeleteProject(ctx, p.ID); err != nil {
			t.Fatal(err)
		}
		got, _ := r.GetTask(ctx, parent.ID)
		if got.ProjectID != nil {
			t.Fatalf("project_id после удаления списка = %v", *got.ProjectID)
		}
		if err := r.DeleteProject(ctx, p.ID); err != model.ErrProjectNotFound {
			t.Fatalf("повторное удаление: %v", err)
		}

		// удаление родителя — каскадом подзадачи
		if err := r.DeleteTask(ctx, parent.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := r.GetTask(ctx, s1.ID); err != model.ErrNotFound {
			t.Fatalf("подзадача пережила родителя: %v", err)
		}
		if err := r.DeleteTask(ctx, parent.ID); err != model.ErrNotFound {
			t.Fatalf("повторное удаление: %v", err)
		}
	})

	t.Run("reorder and plan", func(t *testing.T) {
		r := newRepo(t)
		ctx := t.Context()
		p, _ := r.CreateProject(ctx, "a", "#000000")
		a := mustCreate(t, r, NewTask{Title: "a", ProjectID: &p.ID})
		b := mustCreate(t, r, NewTask{Title: "b", ProjectID: &p.ID})
		c := mustCreate(t, r, NewTask{Title: "c", ProjectID: &p.ID})
		inbox := mustCreate(t, r, NewTask{Title: "inbox"})

		// inbox не из scope — игнорируется
		if err := r.ReorderTasks(ctx, TaskFilter{ProjectID: &p.ID}, []int{c.ID, inbox.ID, a.ID, b.ID}); err != nil {
			t.Fatal(err)
		}
		items, _, _ := r.ListTasks(ctx, TaskQuery{Filter: TaskFilter{ProjectID: &p.ID}})
		if !slices.Equal(ids(items), []int{c.ID, a.ID, b.ID}) {
			t.Fatalf("order = %v", ids(items))
		}
		got, _ := r.GetTask(ctx, inbox.ID)
		if got.Position != inbox.Position {
			t.Fatalf("position задачи вне scope изменилась: %d → %d", inbox.Position, got.Position)
		}

		if err := r.PlanDay(ctx, d0, []int{a.ID, b.ID}, nil); err != nil {
			t.Fatal(err)
		}
		// c не запланирована на d0 — remove её не трогает
		if _, err := r.PatchTask(ctx, c.ID, TaskPatch{ScheduledFor: model.Opt[model.Date]{Set: true, Value: ptr(d0.AddDays(1))}}); err != nil {
			t.Fatal(err)
		}
		if err := r.PlanDay(ctx, d0, nil, []int{a.ID, c.ID}); err != nil {
			t.Fatal(err)
		}
		items, _, _ = r.ListTasks(ctx, TaskQuery{Filter: TaskFilter{ScheduledOn: &d0}})
		if !slices.Equal(ids(items), []int{b.ID}) {
			t.Fatalf("planned = %v, want [%d]", ids(items), b.ID)
		}
		got, _ = r.GetTask(ctx, c.ID)
		if got.ScheduledFor == nil {
			t.Fatal("remove снял день у задачи, запланированной на другой день")
		}
	})

	t.Run("projects", func(t *testing.T) {
		r := newRepo(t)
		ctx := t.Context()
		a, _ := r.CreateProject(ctx, "a", "#111111")
		b, _ := r.CreateProject(ctx, "b", "#222222")
		if b.Position <= a.Position {
			t.Fatalf("новый список не в конце: %d <= %d", b.Position, a.Position)
		}
		if err := r.ReorderProjects(ctx, []int{b.ID, a.ID}); err != nil {
			t.Fatal(err)
		}
		got, err := r.PatchProject(ctx, a.ID, ProjectPatch{Archived: ptr(true), Name: ptr("aa")})
		if err != nil || !got.Archived || got.Name != "aa" || got.Color != "#111111" {
			t.Fatalf("patch: %+v, %v", got, err)
		}
		active, _ := r.ListProjects(ctx, false, d0)
		all, _ := r.ListProjects(ctx, true, d0)
		if len(all) != len(active)+1 {
			t.Fatalf("archived: active %d, all %d", len(active), len(all))
		}
		if slices.ContainsFunc(active, func(p model.Project) bool { return p.ID == a.ID }) {
			t.Fatal("архивный список в выдаче по умолчанию")
		}
		if _, err := r.PatchProject(ctx, 9999, ProjectPatch{Name: ptr("x")}); err != model.ErrProjectNotFound {
			t.Fatalf("err = %v", err)
		}
	})
}

func TestPostgres_DoneActivityUsesAppTZ(t *testing.T) {
	db := openTestSchema(t)
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	r := NewPostgresRepo(db)
	ctx := context.Background()
	for range 3 {
		mustCreate(t, r, NewTask{Title: "x"})
	}
	// 20.09 22:30 UTC — это уже 21.09 по Москве; 21.09 20:59 UTC — ещё 21.09; 21.09 21:00 UTC — 22.09
	mustExec(t, db, `UPDATE tasks SET done = true, done_at = CASE id
		WHEN 1 THEN '2026-09-20 22:30:00Z'::timestamptz
		WHEN 2 THEN '2026-09-21 20:59:00Z'::timestamptz
		ELSE '2026-09-21 21:00:00Z'::timestamptz END`)

	msk, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		t.Fatal(err)
	}
	got, err := r.DoneActivity(ctx, DateRange{From: d0, To: d0}, msk)
	if err != nil {
		t.Fatal(err)
	}
	want := []model.DayCount{{Date: d0, Done: 2}}
	if !slices.Equal(got, want) {
		t.Fatalf("activity = %+v, want %+v", got, want)
	}

	// фейк считает так же
	fr := &FakeRepo{}
	for _, at := range []string{"2026-09-20T22:30:00Z", "2026-09-21T20:59:00Z", "2026-09-21T21:00:00Z"} {
		ts, _ := time.Parse(time.RFC3339, at)
		fr.Tasks = append(fr.Tasks, model.Task{ID: len(fr.Tasks) + 1, Done: true, DoneAt: &ts})
	}
	got, _ = fr.DoneActivity(ctx, DateRange{From: d0, To: d0}, msk)
	if !slices.Equal(got, want) {
		t.Fatalf("fake activity = %+v, want %+v", got, want)
	}
}
