package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

const dateLayout = "2006-01-02"

// Date — календарная дата без времени и таймзоны. JSON: "2026-10-04" или null.
// Нулевое значение означает «даты нет» и пишется в JSON и в БД как null.
// Поля всегда нормализованы, поэтому даты можно сравнивать через ==.
type Date struct {
	Year  int
	Month time.Month
	Day   int
}

// NewDate нормализует переполнения так же, как time.Date: 31 сентября → 1 октября.
func NewDate(year int, month time.Month, day int) Date {
	return DateOf(time.Date(year, month, day, 0, 0, 0, 0, time.UTC))
}

// DateOf берёт календарный день момента t в его собственной таймзоне.
// Чтобы получить день в таймзоне приложения, передавай t.In(loc).
func DateOf(t time.Time) Date {
	y, m, d := t.Date()
	return Date{Year: y, Month: m, Day: d}
}

// Today — текущая дата в таймзоне loc.
func Today(loc *time.Location) Date {
	return DateOf(time.Now().In(loc))
}

// ParseDate разбирает строго "YYYY-MM-DD"; всё остальное — ErrInvalidDate.
func ParseDate(s string) (Date, error) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return Date{}, fmt.Errorf("%w: %q", ErrInvalidDate, s)
	}
	return DateOf(t), nil
}

func (d Date) IsZero() bool { return d == Date{} }

func (d Date) String() string {
	if d.IsZero() {
		return ""
	}
	return d.Time(time.UTC).Format(dateLayout)
}

// Time — полночь этой даты в таймзоне loc.
func (d Date) Time(loc *time.Location) time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, loc)
}

func (d Date) AddDays(n int) Date {
	return NewDate(d.Year, d.Month, d.Day+n)
}

func (d Date) Before(o Date) bool { return d.Time(time.UTC).Before(o.Time(time.UTC)) }
func (d Date) After(o Date) bool  { return o.Before(d) }

func (d Date) MarshalJSON() ([]byte, error) {
	if d.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(d.String())
}

func (d *Date) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*d = Date{}
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("%w: %s", ErrInvalidDate, b)
	}
	parsed, err := ParseDate(s)
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

// Scan: pgx отдаёт DATE как time.Time в UTC-полночь, берём из него только день.
// Строки тоже принимаем — на случай текстового протокола или другого драйвера.
func (d *Date) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*d = Date{}
		return nil
	case time.Time:
		*d = DateOf(v)
		return nil
	case string:
		return d.scanString(v)
	case []byte:
		return d.scanString(string(v))
	default:
		return fmt.Errorf("model.Date: cannot scan %T", src)
	}
}

func (d *Date) scanString(s string) error {
	parsed, err := ParseDate(s)
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

// Value отдаёт строку "YYYY-MM-DD": Postgres сам приведёт её к DATE,
// и таймзона соединения не сдвинет день.
func (d Date) Value() (driver.Value, error) {
	if d.IsZero() {
		return nil, nil
	}
	return d.String(), nil
}
