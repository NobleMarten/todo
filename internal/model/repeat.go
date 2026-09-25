package model

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Repeat — правило повторяющейся задачи. В базе и JSON — строка:
//
//	daily        каждый день
//	weekdays     по будням (пн–пт)
//	weekly:1,4   по дням недели, 1 = пн … 7 = вс
//	monthly:15   каждое 15-е; если в месяце меньше дней — последнее число месяца
type Repeat struct {
	Kind string // daily | weekdays | weekly | monthly
	Days []int  // weekly: дни недели 1..7 по возрастанию
	Day  int    // monthly: число 1..31
}

// ParseRepeat разбирает и проверяет правило; String() отдаёт каноническую форму.
func ParseRepeat(s string) (Repeat, error) {
	bad := func() (Repeat, error) { return Repeat{}, fmt.Errorf("%w: %q", ErrInvalidRepeat, s) }
	kind, arg, hasArg := strings.Cut(strings.TrimSpace(s), ":")
	switch kind {
	case "daily", "weekdays":
		if hasArg {
			return bad()
		}
		return Repeat{Kind: kind}, nil
	case "weekly":
		var days []int
		for _, part := range strings.Split(arg, ",") {
			n, err := strconv.Atoi(strings.TrimSpace(part))
			if err != nil || n < 1 || n > 7 {
				return bad()
			}
			if !slices.Contains(days, n) {
				days = append(days, n)
			}
		}
		slices.Sort(days)
		return Repeat{Kind: kind, Days: days}, nil
	case "monthly":
		n, err := strconv.Atoi(arg)
		if err != nil || n < 1 || n > 31 {
			return bad()
		}
		return Repeat{Kind: kind, Day: n}, nil
	}
	return bad()
}

func (r Repeat) String() string {
	switch r.Kind {
	case "weekly":
		parts := make([]string, len(r.Days))
		for i, d := range r.Days {
			parts[i] = strconv.Itoa(d)
		}
		return "weekly:" + strings.Join(parts, ",")
	case "monthly":
		return "monthly:" + strconv.Itoa(r.Day)
	}
	return r.Kind
}

// isoWeekday — 1 = пн … 7 = вс.
func isoWeekday(d Date) int {
	wd := int(d.Time(time.UTC).Weekday())
	if wd == 0 {
		return 7
	}
	return wd
}

func daysIn(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// Matches — попадает ли дата под правило.
func (r Repeat) Matches(d Date) bool {
	switch r.Kind {
	case "daily":
		return true
	case "weekdays":
		return isoWeekday(d) <= 5
	case "weekly":
		return slices.Contains(r.Days, isoWeekday(d))
	case "monthly":
		return d.Day == min(r.Day, daysIn(d.Year, d.Month))
	}
	return false
}

// After — первая подходящая дата строго после d. Любое правило срабатывает хотя бы раз в 31 день,
// так что перебор по дням короткий.
func (r Repeat) After(d Date) Date {
	for i := 1; i <= 400; i++ {
		if n := d.AddDays(i); r.Matches(n) {
			return n
		}
	}
	return d.AddDays(1) // недостижимо для правил, прошедших ParseRepeat
}

// DaysBetween — b − a в календарных днях.
func DaysBetween(a, b Date) int {
	return int(b.Time(time.UTC).Sub(a.Time(time.UTC)).Hours() / 24)
}
