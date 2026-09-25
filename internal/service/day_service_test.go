package service

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

func TestDay(t *testing.T) {
	ctx := context.Background()
	repo := &storage.FakeRepo{}
	at := func(s string) *time.Time {
		ts, _ := time.Parse(time.RFC3339, s)
		return &ts
	}
	yesterday := d0.AddDays(-1)
	repo.Tasks = []model.Task{
		{ID: 1, Position: 2, ScheduledFor: &d0},
		{ID: 2, Position: 1, ScheduledFor: &d0, DueDate: &yesterday},        // и planned, и overdue → только planned
		{ID: 3, Position: 3, DueDate: &yesterday, ScheduledFor: &yesterday}, // и overdue, и carry → только overdue
		{ID: 4, Position: 4, ScheduledFor: &yesterday},
		{ID: 5, Position: 5, ParentID: ptr(1), ScheduledFor: &d0},            // подзадачи в блоки не попадают
		{ID: 6, Position: 6, Done: true, DoneAt: at("2026-09-20T21:30:00Z")}, // 21.09 00:30 по Москве
		{ID: 7, Position: 7, Done: true, DoneAt: at("2026-09-20T20:30:00Z")}, // ещё 20.09 по Москве
		{ID: 8, Position: 8, Done: true, ScheduledFor: &d0, DoneAt: at("2026-09-21T12:00:00Z")},
	}
	day, err := NewDayService(repo, msk).Day(ctx, &d0)
	if err != nil {
		t.Fatal(err)
	}

	check := func(name string, got []model.Task, want []int) {
		t.Helper()
		if ids := taskIDs(got); !slices.Equal(ids, want) {
			t.Fatalf("%s = %v, want %v", name, ids, want)
		}
	}
	check("planned", day.Planned, []int{2, 1})
	check("overdue", day.Overdue, []int{3})
	check("carry_over", day.CarryOver, []int{4})
	check("done_today", day.DoneToday, []int{8, 6})
	if day.Counts != (DayCounts{Planned: 2, Done: 2, Overdue: 1}) || day.Date != d0 {
		t.Fatalf("counts = %+v, date = %v", day.Counts, day.Date)
	}
	if day.Planned[1].SubtaskStats == nil || day.Planned[1].SubtaskStats.Total != 1 {
		t.Fatalf("subtask_stats = %+v", day.Planned[1].SubtaskStats)
	}
}

func TestSuggestions(t *testing.T) {
	ctx := context.Background()
	repo := &storage.FakeRepo{}
	old := d0.AddDays(-30).Time(msk)
	fresh := d0.AddDays(-3).Time(msk)
	repo.Tasks = []model.Task{
		{ID: 1, DueDate: ptr(d0.AddDays(-2))},
		{ID: 2, DueDate: ptr(d0.AddDays(-5)), ScheduledFor: &d0}, // уже в плане на d0 — не предлагаем
		{ID: 3, DueDate: ptr(d0.AddDays(-9))},
		{ID: 4, DueDate: &d0},
		{ID: 5, DueDate: ptr(d0.AddDays(7)), ScheduledFor: ptr(d0.AddDays(3))},
		{ID: 6, DueDate: ptr(d0.AddDays(8))},
		{ID: 7, UpdatedAt: fresh},
		{ID: 8, Done: true, UpdatedAt: old},
	}
	// 12 залежавшихся: в ответ идут 10 самых старых
	for i := range 12 {
		repo.Tasks = append(repo.Tasks, model.Task{ID: 100 + i, UpdatedAt: old.Add(time.Duration(12-i) * time.Hour)})
	}

	got, err := NewDayService(repo, msk).Suggestions(ctx, &d0)
	if err != nil {
		t.Fatal(err)
	}
	if ids := taskIDs(got.Overdue); !slices.Equal(ids, []int{3, 1}) {
		t.Fatalf("overdue = %v", ids)
	}
	if ids := taskIDs(got.DueSoon); !slices.Equal(ids, []int{4, 5}) {
		t.Fatalf("due_soon = %v", ids)
	}
	if ids := taskIDs(got.Stale); !slices.Equal(ids, []int{111, 110, 109, 108, 107, 106, 105, 104, 103, 102}) {
		t.Fatalf("stale = %v", ids)
	}
}

func TestPlan(t *testing.T) {
	ctx := context.Background()
	repo := &storage.FakeRepo{}
	repo.Tasks = []model.Task{{ID: 1}, {ID: 2, ScheduledFor: &d0}, {ID: 3, Done: true}}
	s := NewDayService(repo, msk)

	if err := s.Plan(ctx, d0, []int{1, 3, 1}, []int{2}); err != nil {
		t.Fatal(err)
	}
	if repo.Tasks[0].ScheduledFor == nil || repo.Tasks[1].ScheduledFor != nil || repo.Tasks[2].ScheduledFor != nil {
		t.Fatalf("tasks = %+v", repo.Tasks)
	}
	if err := s.Plan(ctx, model.Date{}, []int{1}, nil); !errors.Is(err, model.ErrInvalidBody) {
		t.Fatalf("без даты: %v", err)
	}
}

func TestWeek(t *testing.T) {
	ctx := context.Background()
	repo := &storage.FakeRepo{}
	at := func(s string) *time.Time {
		ts, _ := time.Parse(time.RFC3339, s)
		return &ts
	}
	mon, tue, thu, sun := d0, d0.AddDays(1), d0.AddDays(3), d0.AddDays(6) // d0 = пн 21.09
	repo.Tasks = []model.Task{
		{ID: 1, Position: 1, ScheduledFor: &mon},
		{ID: 2, Position: 2, ScheduledFor: &tue, DueDate: &thu},                                    // в двух днях: вт (делаю) и чт (дедлайн)
		{ID: 3, Position: 3, ScheduledFor: &thu, DueDate: &thu},                                    // один день — только как запланированная
		{ID: 4, Position: 4, DueDate: &sun},                                                        // только дедлайн
		{ID: 5, Position: 5, DueDate: ptr(sun.AddDays(1))},                                         // после недели → upcoming
		{ID: 6, Position: 6, DueDate: ptr(sun.AddDays(61))},                                        // дальше 60 дней → никуда
		{ID: 7, Position: 7},                                                                       // бэклог
		{ID: 8, Position: 8, ParentID: ptr(7), ScheduledFor: &mon},                                 // подзадача — никуда
		{ID: 9, Position: 9, ScheduledFor: ptr(mon.AddDays(-1))},                                   // прошлая неделя
		{ID: 10, Position: 10, Done: true, ScheduledFor: &mon, DoneAt: at("2026-09-21T22:30:00Z")}, // вт 01:30 МСК
		{ID: 11, Position: 11, Done: true, DoneAt: at("2026-09-20T20:30:00Z")},                     // вс прошлой недели
		{ID: 12, Position: 0},                                                                      // бэклог, выше по position
	}
	svc := NewDayService(repo, msk)
	w, err := svc.Week(ctx, &mon)
	if err != nil {
		t.Fatal(err)
	}
	if w.From != mon || w.To != sun || len(w.Days) != 7 {
		t.Fatalf("from %v to %v days %d", w.From, w.To, len(w.Days))
	}

	check := func(name string, got []model.Task, want []int) {
		t.Helper()
		if ids := taskIDs(got); !slices.Equal(ids, want) {
			t.Fatalf("%s = %v, want %v", name, ids, want)
		}
	}
	check("пн scheduled", w.Days[0].Scheduled, []int{1})
	check("пн done", w.Days[0].Done, []int{})
	check("вт scheduled", w.Days[1].Scheduled, []int{2})
	check("вт done", w.Days[1].Done, []int{10})
	check("чт scheduled", w.Days[3].Scheduled, []int{3})
	check("чт deadlines", w.Days[3].Deadlines, []int{2})
	check("вс deadlines", w.Days[6].Deadlines, []int{4})
	check("upcoming", w.Upcoming, []int{5})
	check("backlog", w.Backlog, []int{12, 7})
	if w.BacklogTotal != 2 {
		t.Fatalf("backlog_total = %d", w.BacklogTotal)
	}

	// без from — понедельник текущей недели в APP_TZ
	w, err = svc.Week(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := w.From.Time(time.UTC).Weekday(); got != time.Monday {
		t.Fatalf("from без параметра = %v (%v)", w.From, got)
	}
	if today := model.Today(msk); today.Before(w.From) || today.After(w.To) {
		t.Fatalf("сегодня %v не в неделе %v–%v", today, w.From, w.To)
	}
}

func TestMondayOf(t *testing.T) {
	for _, c := range []struct{ in, want model.Date }{
		{model.NewDate(2026, 9, 21), model.NewDate(2026, 9, 21)}, // пн
		{model.NewDate(2026, 9, 27), model.NewDate(2026, 9, 21)}, // вс
		{model.NewDate(2026, 9, 25), model.NewDate(2026, 9, 21)}, // пт
		{model.NewDate(2026, 10, 1), model.NewDate(2026, 9, 28)}, // через границу месяца
		{model.NewDate(2027, 1, 2), model.NewDate(2026, 12, 28)}, // и года
	} {
		if got := mondayOf(c.in); got != c.want {
			t.Fatalf("mondayOf(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}
