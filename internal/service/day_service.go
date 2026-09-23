package service

import (
	"context"
	"fmt"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

const (
	dueSoonDays = 7  // «дедлайн на этой неделе»
	staleDays   = 14 // сколько дней задачу не трогали, чтобы предложить её снова
	staleLimit  = 10
)

type DayService struct {
	tasks storage.TaskRepo
	loc   *time.Location
}

func NewDayService(tasks storage.TaskRepo, loc *time.Location) *DayService {
	return &DayService{tasks: tasks, loc: loc}
}

type DayCounts struct {
	Planned int `json:"planned"`
	Done    int `json:"done"`
	Overdue int `json:"overdue"`
}

// Day — экран «Сегодня». Каждая задача попадает ровно в один блок
// в порядке planned → overdue → carry_over, чтобы не рисовать её дважды.
type Day struct {
	Date      model.Date   `json:"date"`
	Planned   []model.Task `json:"planned"`
	Overdue   []model.Task `json:"overdue"`
	CarryOver []model.Task `json:"carry_over"`
	DoneToday []model.Task `json:"done_today"`
	Counts    DayCounts    `json:"counts"`
}

type Suggestions struct {
	Overdue []model.Task `json:"overdue"`
	DueSoon []model.Task `json:"due_soon"`
	Stale   []model.Task `json:"stale"`
}

func (s *DayService) list(ctx context.Context, q storage.TaskQuery) ([]model.Task, error) {
	items, _, err := s.tasks.ListTasks(ctx, q)
	return items, err
}

func (s *DayService) Day(ctx context.Context, date *model.Date) (Day, error) {
	d := dateOrToday(date, s.loc)
	notDone, done := false, true

	planned, err := s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, ScheduledOn: &d},
	})
	if err != nil {
		return Day{}, err
	}
	overdue, err := s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, DueBefore: &d},
		Sort:   storage.SortDueDate,
	})
	if err != nil {
		return Day{}, err
	}
	carry, err := s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, ScheduledBefore: &d},
		Sort:   storage.SortScheduledFor,
	})
	if err != nil {
		return Day{}, err
	}
	doneToday, err := s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &done, DoneBetween: &storage.TimeRange{
			From: d.Time(s.loc), To: d.AddDays(1).Time(s.loc),
		}},
		Sort: storage.SortDoneAt,
		Desc: true,
	})
	if err != nil {
		return Day{}, err
	}

	seen := map[int]bool{}
	take := func(tasks []model.Task) []model.Task {
		out := []model.Task{}
		for _, t := range tasks {
			if !seen[t.ID] {
				seen[t.ID] = true
				out = append(out, t)
			}
		}
		return out
	}
	day := Day{
		Date:      d,
		Planned:   take(planned),
		Overdue:   take(overdue),
		CarryOver: take(carry),
		DoneToday: doneToday,
	}
	day.Counts = DayCounts{Planned: len(day.Planned), Done: len(day.DoneToday), Overdue: len(day.Overdue)}
	return day, nil
}

// Suggestions — материал для «Собрать день». Уже запланированное на date не предлагается.
func (s *DayService) Suggestions(ctx context.Context, date *model.Date) (Suggestions, error) {
	d := dateOrToday(date, s.loc)
	notDone := false
	var out Suggestions
	var err error

	out.Overdue, err = s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, DueBefore: &d, NotScheduledOn: &d},
		Sort:   storage.SortDueDate,
	})
	if err != nil {
		return Suggestions{}, err
	}
	out.DueSoon, err = s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{
			Done:           &notDone,
			DueBetween:     &storage.DateRange{From: d, To: d.AddDays(dueSoonDays)},
			NotScheduledOn: &d,
		},
		Sort: storage.SortDueDate,
	})
	if err != nil {
		return Suggestions{}, err
	}
	// «не трогали 14 дней» отсчитываем от начала выбранного дня, а не от текущего момента
	staleBefore := d.AddDays(-staleDays).Time(s.loc)
	out.Stale, err = s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, NoDates: true, UpdatedBefore: &staleBefore},
		Sort:   storage.SortUpdatedAt,
		Limit:  staleLimit,
	})
	if err != nil {
		return Suggestions{}, err
	}
	return out, nil
}

// Plan одним запросом добавляет задачи в день и убирает из него.
func (s *DayService) Plan(ctx context.Context, date model.Date, add, remove []int) error {
	if date.IsZero() {
		return fmt.Errorf("%w: date is required", model.ErrInvalidBody)
	}
	return s.tasks.PlanDay(ctx, date, uniqueIDs(add), uniqueIDs(remove))
}
