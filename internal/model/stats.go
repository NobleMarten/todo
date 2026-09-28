package model

import "time"

// StatsSummary — ответ GET /stats/summary: период [From, To], такой же период перед ним
// (для сравнения) и состояние невыполненных задач. Всё только по корневым задачам.
type StatsSummary struct {
	From    Date         `json:"from"`
	To      Date         `json:"to"`
	Totals  StatsTotals  `json:"totals"`
	Prev    StatsTotals  `json:"prev"` // период той же длины, закончившийся накануне From
	Days    []StatsDay   `json:"days"` // каждый день отрезка, пустые — нулями
	Lists   []ListDone   `json:"lists"`
	ByPrio  PrioCounts   `json:"by_priority"`
	Weekday [7]int       `json:"weekday"` // выполнено по дням недели: 0 = пн … 6 = вс
	Hours   [24]int      `json:"hours"`   // выполнено по часам done_at
	Backlog StatsBacklog `json:"backlog"`
}

// StatsTotals — итоги периода.
type StatsTotals struct {
	Done        int `json:"done"`
	Created     int `json:"created"`
	CreatedDone int `json:"created_done"` // из созданных за период уже выполнено
	OnTime      int `json:"on_time"`      // выполнены в день дедлайна или раньше
	Late        int `json:"late"`         // выполнены после дедлайна
	ActiveDays  int `json:"active_days"`  // дней, когда что-то выполнено
	// LeadHours — медиана «создана → выполнена» в часах; nil, если за период ничего не выполнено.
	LeadHours *float64 `json:"lead_hours"`
}

// StatsDay — выполнено и создано за один день.
type StatsDay struct {
	Date    Date `json:"date"`
	Done    int  `json:"done"`
	Created int  `json:"created"`
}

// ListDone — выполнено за период в одном списке; ProjectID nil — «входящие».
type ListDone struct {
	ProjectID *int `json:"project_id"`
	Done      int  `json:"done"`
}

type PrioCounts struct {
	High   int `json:"high"`
	Medium int `json:"medium"`
	Low    int `json:"low"`
}

// StatsBacklog — невыполненные задачи на день To.
type StatsBacklog struct {
	Active    int       `json:"active"`
	Overdue   int       `json:"overdue"`  // дедлайн раньше To
	NoDates   int       `json:"no_dates"` // ни дедлайна, ни дня работы
	Inbox     int       `json:"inbox"`
	Stale     int       `json:"stale"`     // не менялись дольше 30 дней
	Postponed int       `json:"postponed"` // сумма переносов по невыполненным
	AgeDays   *int      `json:"age_days"`  // медианный возраст в днях; nil, если задач нет
	Oldest    *TaskRef  `json:"oldest"`
	Delayed   []TaskRef `json:"delayed"` // чаще всего переносимые, до 5
}

// TaskRef — задача в статистике: ровно то, что нужно для строки со ссылкой на карточку.
type TaskRef struct {
	ID        int       `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	Postponed int       `json:"postponed"`
}
