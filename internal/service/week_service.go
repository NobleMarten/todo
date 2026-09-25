package service

import (
	"context"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

const (
	weekDays      = 7
	upcomingDays  = 60 // «дедлайны впереди» — после недели и не дальше этого
	upcomingLimit = 6
	backlogLimit  = 30
)

// WeekDay — один день полосы «Недели».
type WeekDay struct {
	Date      model.Date   `json:"date"`
	Scheduled []model.Task `json:"scheduled"` // scheduled_for = date, невыполненные
	Deadlines []model.Task `json:"deadlines"` // due_date = date, невыполненные, не запланированные на этот же день
	Done      []model.Task `json:"done"`      // выполненные в этот день по APP_TZ
}

// Week — экран «Неделя» (макет C1): семь дней с from, дедлайны после недели и бэклог.
type Week struct {
	From         model.Date   `json:"from"`
	To           model.Date   `json:"to"`
	Days         []WeekDay    `json:"days"`
	Upcoming     []model.Task `json:"upcoming"`      // дедлайны после недели, ближайшие сверху
	Backlog      []model.Task `json:"backlog"`       // невыполненные без дат, по position
	BacklogTotal int          `json:"backlog_total"` // сколько всего в бэклоге (в Backlog — не больше backlogLimit)
}

// mondayOf — понедельник недели, в которую попадает d.
func mondayOf(d model.Date) model.Date {
	wd := int(d.Time(time.UTC).Weekday()) // 0 = воскресенье
	return d.AddDays(-((wd + 6) % 7))
}

// Week собирает неделю с from (без from — с понедельника текущей недели в APP_TZ).
// Задача с датами в двух днях недели показывается в обоих: в дне работы и в дне дедлайна.
func (s *DayService) Week(ctx context.Context, from *model.Date) (Week, error) {
	start := mondayOf(model.Today(s.loc))
	if from != nil && !from.IsZero() {
		start = *from
	}
	end := start.AddDays(weekDays - 1)
	notDone, done := false, true

	dated, err := s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, AnyDateBetween: &storage.DateRange{From: start, To: end}},
	})
	if err != nil {
		return Week{}, err
	}
	finished, err := s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &done, DoneBetween: &storage.TimeRange{
			From: start.Time(s.loc), To: end.AddDays(1).Time(s.loc),
		}},
		Sort: storage.SortDoneAt,
	})
	if err != nil {
		return Week{}, err
	}

	w := Week{From: start, To: end, Days: make([]WeekDay, weekDays)}
	index := map[model.Date]int{}
	for i := range w.Days {
		d := start.AddDays(i)
		w.Days[i] = WeekDay{Date: d, Scheduled: []model.Task{}, Deadlines: []model.Task{}, Done: []model.Task{}}
		index[d] = i
	}
	for _, t := range dated {
		if t.ScheduledFor != nil {
			if i, ok := index[*t.ScheduledFor]; ok {
				w.Days[i].Scheduled = append(w.Days[i].Scheduled, t)
			}
		}
		if t.DueDate != nil && (t.ScheduledFor == nil || *t.ScheduledFor != *t.DueDate) {
			if i, ok := index[*t.DueDate]; ok {
				w.Days[i].Deadlines = append(w.Days[i].Deadlines, t)
			}
		}
	}
	for _, t := range finished {
		if t.DoneAt == nil {
			continue
		}
		if i, ok := index[model.DateOf(t.DoneAt.In(s.loc))]; ok {
			w.Days[i].Done = append(w.Days[i].Done, t)
		}
	}

	w.Upcoming, err = s.list(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, DueBetween: &storage.DateRange{
			From: end.AddDays(1), To: end.AddDays(upcomingDays),
		}},
		Sort:  storage.SortDueDate,
		Limit: upcomingLimit,
	})
	if err != nil {
		return Week{}, err
	}
	w.Backlog, w.BacklogTotal, err = s.tasks.ListTasks(ctx, storage.TaskQuery{
		Filter: storage.TaskFilter{Done: &notDone, NoDates: true},
		Limit:  backlogLimit,
	})
	if err != nil {
		return Week{}, err
	}
	if w.Backlog == nil {
		w.Backlog = []model.Task{}
	}
	if w.Upcoming == nil {
		w.Upcoming = []model.Task{}
	}
	return w, nil
}
