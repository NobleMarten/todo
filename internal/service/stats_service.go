package service

import (
	"cmp"
	"context"
	"fmt"
	"math"
	"slices"
	"time"
	"todo/internal/model"
)

const (
	statsDaysDefault = 30
	statsDaysMax     = 366 // год, в том числе високосный; с прошлым периодом — два года задач
	statsStaleDays   = 30  // невыполненная задача «залежалась», если её не меняли дольше
	delayedTop       = 5
)

// Summary — статистика за период [from, to] (по умолчанию последние 30 дней до сегодня в APP_TZ)
// в сравнении с таким же периодом перед ним, плюс состояние невыполненных задач на день to.
// Репозиторий отдаёт сырые корневые задачи, считает summarize: так фейк и Postgres не расходятся
// в медианах и границах дней, а задач у одного человека — сотни, не миллионы.
func (s *TaskService) Summary(ctx context.Context, userID int, from, to *model.Date) (model.StatsSummary, error) {
	end := dateOrToday(to, s.loc)
	start := end.AddDays(-(statsDaysDefault - 1))
	if from != nil {
		start = *from
	}
	if start.After(end) {
		return model.StatsSummary{}, fmt.Errorf("%w: from after to", model.ErrInvalidQuery)
	}
	if n := daysBetween(start, end) + 1; n > statsDaysMax {
		return model.StatsSummary{}, fmt.Errorf("%w: period longer than %d days", model.ErrInvalidQuery, statsDaysMax)
	}
	prevStart := start.AddDays(-(daysBetween(start, end) + 1))
	tasks, err := s.tasks.StatsTasks(ctx, userID, prevStart.Time(s.loc))
	if err != nil {
		return model.StatsSummary{}, err
	}
	return summarize(tasks, start, end, s.loc), nil
}

// daysBetween — сколько суток от a до b (b позже — положительное).
func daysBetween(a, b model.Date) int {
	return int(b.Time(time.UTC).Sub(a.Time(time.UTC)) / (24 * time.Hour))
}

func inDates(d, from, to model.Date) bool {
	return !d.Before(from) && !d.After(to)
}

// summarize считает всю статистику по корневым задачам; дни, часы и дни недели — в loc.
func summarize(tasks []model.Task, from, to model.Date, loc *time.Location) model.StatsSummary {
	n := daysBetween(from, to) + 1
	prevFrom, prevTo := from.AddDays(-n), from.AddDays(-1)

	out := model.StatsSummary{From: from, To: to, Days: make([]model.StatsDay, n), Lists: []model.ListDone{}}
	for i := range out.Days {
		out.Days[i].Date = from.AddDays(i)
	}
	cur, prev := newTotalsAcc(), newTotalsAcc()
	lists := map[int]int{} // 0 — «входящие»: id списков начинаются с 1
	var backlog backlogAcc

	for _, t := range tasks {
		created := model.DateOf(t.CreatedAt.In(loc))
		switch {
		case inDates(created, from, to):
			cur.created(t)
			out.Days[daysBetween(from, created)].Created++
		case inDates(created, prevFrom, prevTo):
			prev.created(t)
		}

		if !t.Done {
			backlog.add(t, to, loc)
			continue
		}
		if t.DoneAt == nil {
			continue
		}
		at := t.DoneAt.In(loc)
		day := model.DateOf(at)
		switch {
		case inDates(day, from, to):
			cur.done(t, day)
			out.Days[daysBetween(from, day)].Done++
			lists[derefOr(t.ProjectID)]++
			switch t.Priority {
			case "high":
				out.ByPrio.High++
			case "medium":
				out.ByPrio.Medium++
			default:
				out.ByPrio.Low++
			}
			out.Weekday[(int(at.Weekday())+6)%7]++
			out.Hours[at.Hour()]++
		case inDates(day, prevFrom, prevTo):
			prev.done(t, day)
		}
	}

	out.Totals, out.Prev = cur.result(), prev.result()
	for id, done := range lists {
		ld := model.ListDone{Done: done}
		if id != 0 {
			ld.ProjectID = &id
		}
		out.Lists = append(out.Lists, ld)
	}
	slices.SortFunc(out.Lists, func(a, b model.ListDone) int {
		return cmp.Or(cmp.Compare(b.Done, a.Done), cmp.Compare(derefOr(a.ProjectID), derefOr(b.ProjectID)))
	})
	out.Backlog = backlog.result()
	return out
}

func derefOr(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

type totalsAcc struct {
	model.StatsTotals
	leads []float64
	days  map[model.Date]bool
}

func newTotalsAcc() *totalsAcc {
	return &totalsAcc{days: map[model.Date]bool{}}
}

func (a *totalsAcc) created(t model.Task) {
	a.Created++
	if t.Done {
		a.CreatedDone++
	}
}

func (a *totalsAcc) done(t model.Task, day model.Date) {
	a.Done++
	a.days[day] = true
	if t.DueDate != nil {
		if day.After(*t.DueDate) {
			a.Late++
		} else {
			a.OnTime++
		}
	}
	a.leads = append(a.leads, max(0, t.DoneAt.Sub(t.CreatedAt).Hours()))
}

func (a *totalsAcc) result() model.StatsTotals {
	out := a.StatsTotals
	out.ActiveDays = len(a.days)
	if m, ok := median(a.leads); ok {
		m = math.Round(m*10) / 10
		out.LeadHours = &m
	}
	return out
}

func median(xs []float64) (float64, bool) {
	if len(xs) == 0 {
		return 0, false
	}
	s := slices.Clone(xs)
	slices.Sort(s)
	mid := len(s) / 2
	if len(s)%2 == 1 {
		return s[mid], true
	}
	return (s[mid-1] + s[mid]) / 2, true
}

type backlogAcc struct {
	model.StatsBacklog
	ages    []float64
	oldest  *model.Task
	delayed []model.Task
}

// add учитывает невыполненную задачу на день to.
func (a *backlogAcc) add(t model.Task, to model.Date, loc *time.Location) {
	a.Active++
	if t.DueDate != nil && t.DueDate.Before(to) {
		a.Overdue++
	}
	if t.DueDate == nil && t.ScheduledFor == nil {
		a.NoDates++
	}
	if t.ProjectID == nil {
		a.Inbox++
	}
	if t.UpdatedAt.Before(to.AddDays(-statsStaleDays).Time(loc)) {
		a.Stale++
	}
	a.Postponed += t.Postponed
	a.ages = append(a.ages, float64(max(0, daysBetween(model.DateOf(t.CreatedAt.In(loc)), to))))
	if a.oldest == nil || t.CreatedAt.Before(a.oldest.CreatedAt) {
		a.oldest = &t
	}
	if t.Postponed > 0 {
		a.delayed = append(a.delayed, t)
	}
}

func (a *backlogAcc) result() model.StatsBacklog {
	out := a.StatsBacklog
	out.Delayed = []model.TaskRef{}
	if m, ok := median(a.ages); ok {
		days := int(math.Round(m))
		out.AgeDays = &days
	}
	if a.oldest != nil {
		ref := taskRef(*a.oldest)
		out.Oldest = &ref
	}
	// чаще переносимые выше, при равенстве — более старые
	slices.SortFunc(a.delayed, func(x, y model.Task) int {
		return cmp.Or(cmp.Compare(y.Postponed, x.Postponed), x.CreatedAt.Compare(y.CreatedAt), cmp.Compare(x.ID, y.ID))
	})
	for _, t := range a.delayed[:min(len(a.delayed), delayedTop)] {
		out.Delayed = append(out.Delayed, taskRef(t))
	}
	return out
}

func taskRef(t model.Task) model.TaskRef {
	return model.TaskRef{ID: t.ID, Title: t.Title, CreatedAt: t.CreatedAt, Postponed: t.Postponed}
}
