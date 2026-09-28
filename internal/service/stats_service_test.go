package service

import (
	"context"
	"errors"
	"testing"
	"time"
	"todo/internal/model"
)

func TestSummary(t *testing.T) {
	ctx := context.Background()
	s, repo := newTaskService()
	at := func(s string) time.Time {
		ts, err := time.Parse(time.RFC3339, s)
		if err != nil {
			panic(err)
		}
		return ts
	}
	pat := func(s string) *time.Time { ts := at(s); return &ts }
	// период 15.09–21.09 (вт–пн), прошлый — 08.09–14.09; время UTC, дни по Москве (+3)
	repo.Tasks = []model.Task{
		// создана и выполнена в периоде, в срок, в список 7; 21.09 01:30 МСК — понедельник
		{ID: 1, Title: "a", Priority: "high", ProjectID: ptr(7), DueDate: ptr(d0), Done: true,
			CreatedAt: at("2026-09-19T22:30:00Z"), DoneAt: pat("2026-09-20T22:30:00Z")},
		// создана в прошлом периоде, выполнена в этом с опозданием, «входящие»
		{ID: 2, Title: "b", Priority: "low", DueDate: ptr(d0.AddDays(-7)), Done: true,
			CreatedAt: at("2026-09-10T09:00:00Z"), DoneAt: pat("2026-09-15T09:00:00Z")},
		// прошлый период целиком
		{ID: 3, Title: "c", Priority: "medium", Done: true,
			CreatedAt: at("2026-09-08T09:00:00Z"), DoneAt: pat("2026-09-09T09:00:00Z")},
		// невыполненные: просрочена и переносилась, без дат во «входящих» и давно не тронута
		{ID: 4, Title: "d", Priority: "low", ProjectID: ptr(7), DueDate: ptr(d0.AddDays(-1)), Postponed: 3,
			CreatedAt: at("2026-09-16T09:00:00Z"), UpdatedAt: at("2026-09-20T09:00:00Z")},
		{ID: 5, Title: "e", Priority: "low", Postponed: 1,
			CreatedAt: at("2026-07-01T09:00:00Z"), UpdatedAt: at("2026-07-01T09:00:00Z")},
		// подзадачи в статистику не попадают
		{ID: 6, Title: "sub", Priority: "low", ParentID: ptr(1), Done: true,
			CreatedAt: at("2026-09-19T09:00:00Z"), DoneAt: pat("2026-09-19T10:00:00Z")},
	}
	own(repo)

	got, err := s.Summary(ctx, u1, ptr(d0.AddDays(-6)), &d0)
	if err != nil {
		t.Fatal(err)
	}

	lead := 72.0 // медиана из 24 ч и 120 ч
	want := model.StatsTotals{Done: 2, Created: 2, CreatedDone: 1, OnTime: 1, Late: 1, ActiveDays: 2, LeadHours: &lead}
	if !eqTotals(got.Totals, want) {
		t.Fatalf("totals = %+v, want %+v", got.Totals, want)
	}
	prevLead := 24.0
	wantPrev := model.StatsTotals{Done: 1, Created: 2, CreatedDone: 2, ActiveDays: 1, LeadHours: &prevLead}
	if !eqTotals(got.Prev, wantPrev) {
		t.Fatalf("prev = %+v, want %+v", got.Prev, wantPrev)
	}

	if len(got.Days) != 7 || got.Days[0].Date != d0.AddDays(-6) || got.Days[6].Date != d0 {
		t.Fatalf("days = %+v", got.Days)
	}
	if got.Days[0].Done != 1 || got.Days[6].Done != 1 || got.Days[5].Created != 1 || got.Days[1].Created != 1 {
		t.Fatalf("days = %+v", got.Days)
	}
	if len(got.Lists) != 2 || got.Lists[0].ProjectID != nil || *got.Lists[1].ProjectID != 7 {
		t.Fatalf("lists = %+v (при равенстве «входящие» первыми)", got.Lists)
	}
	if got.ByPrio != (model.PrioCounts{High: 1, Low: 1}) {
		t.Fatalf("by_priority = %+v", got.ByPrio)
	}
	if got.Weekday[0] != 1 || got.Weekday[1] != 1 {
		t.Fatalf("weekday = %v, want пн и вт", got.Weekday)
	}
	if got.Hours[1] != 1 || got.Hours[12] != 1 {
		t.Fatalf("hours = %v, want 01 и 12 по Москве", got.Hours)
	}

	b := got.Backlog
	if b.Active != 2 || b.Overdue != 1 || b.NoDates != 1 || b.Inbox != 1 || b.Stale != 1 || b.Postponed != 4 {
		t.Fatalf("backlog = %+v", b)
	}
	if b.AgeDays == nil {
		t.Fatal("age_days = nil")
	}
	if *b.AgeDays != 44 { // 5 и 82 дня: 43,5 округляется вверх
		t.Fatalf("age_days = %d", *b.AgeDays)
	}
	if b.Oldest == nil || b.Oldest.ID != 5 {
		t.Fatalf("oldest = %+v", b.Oldest)
	}
	if len(b.Delayed) != 2 || b.Delayed[0].ID != 4 || b.Delayed[1].ID != 5 {
		t.Fatalf("delayed = %+v", b.Delayed)
	}
}

func TestSummaryDefaultsAndLimits(t *testing.T) {
	ctx := context.Background()
	s, _ := newTaskService()

	got, err := s.Summary(ctx, u1, nil, &d0)
	if err != nil {
		t.Fatal(err)
	}
	if got.From != d0.AddDays(-29) || len(got.Days) != 30 {
		t.Fatalf("по умолчанию: from = %s, дней %d", got.From, len(got.Days))
	}
	if got.Totals.LeadHours != nil || got.Backlog.AgeDays != nil || got.Backlog.Oldest != nil ||
		got.Lists == nil || got.Backlog.Delayed == nil {
		t.Fatalf("пустая статистика: %+v", got)
	}

	if _, err := s.Summary(ctx, u1, ptr(d0.AddDays(1)), &d0); !errors.Is(err, model.ErrInvalidQuery) {
		t.Fatalf("from > to: %v", err)
	}
	if _, err := s.Summary(ctx, u1, ptr(d0.AddDays(-366)), &d0); !errors.Is(err, model.ErrInvalidQuery) {
		t.Fatalf("367 дней: %v", err)
	}
	if _, err := s.Summary(ctx, u1, ptr(d0.AddDays(-365)), &d0); err != nil {
		t.Fatalf("366 дней: %v", err)
	}
}

func eqTotals(a, b model.StatsTotals) bool {
	if (a.LeadHours == nil) != (b.LeadHours == nil) || (a.LeadHours != nil && *a.LeadHours != *b.LeadHours) {
		return false
	}
	a.LeadHours, b.LeadHours = nil, nil
	return a == b
}
