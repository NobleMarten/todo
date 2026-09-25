package model

import (
	"errors"
	"testing"
)

func TestParseRepeat(t *testing.T) {
	for in, want := range map[string]string{
		"daily":          "daily",
		" weekdays ":     "weekdays",
		"weekly:4,1":     "weekly:1,4",
		"weekly:1, 1 ,7": "weekly:1,7",
		"monthly:15":     "monthly:15",
		"monthly:31":     "monthly:31",
	} {
		r, err := ParseRepeat(in)
		if err != nil || r.String() != want {
			t.Fatalf("ParseRepeat(%q) = %q, %v; want %q", in, r.String(), err, want)
		}
	}
	for _, in := range []string{"", "hourly", "daily:1", "weekly", "weekly:", "weekly:0", "weekly:8", "weekly:a",
		"monthly", "monthly:0", "monthly:32", "monthly:1,2", "weekdays:1"} {
		if _, err := ParseRepeat(in); !errors.Is(err, ErrInvalidRepeat) {
			t.Fatalf("ParseRepeat(%q) err = %v", in, err)
		}
	}
}

func TestRepeatAfter(t *testing.T) {
	fri := NewDate(2026, 9, 25) // пятница
	cases := []struct {
		rule string
		from Date
		want Date
	}{
		{"daily", fri, NewDate(2026, 9, 26)},
		{"weekdays", fri, NewDate(2026, 9, 28)},                    // через выходные
		{"weekdays", NewDate(2026, 9, 22), NewDate(2026, 9, 23)},   // вт → ср
		{"weekly:1,4", fri, NewDate(2026, 9, 28)},                  // пт → пн
		{"weekly:1,4", NewDate(2026, 9, 28), NewDate(2026, 10, 1)}, // пн → чт
		{"weekly:5", fri, NewDate(2026, 10, 2)},                    // пт → следующая пт
		{"weekly:7", fri, NewDate(2026, 9, 27)},
		{"monthly:25", fri, NewDate(2026, 10, 25)},
		{"monthly:31", fri, NewDate(2026, 9, 30)}, // в сентябре 30 дней
		{"monthly:31", NewDate(2026, 9, 30), NewDate(2026, 10, 31)},
		{"monthly:30", NewDate(2027, 1, 30), NewDate(2027, 2, 28)}, // февраль
		{"monthly:29", NewDate(2028, 1, 29), NewDate(2028, 2, 29)}, // високосный
		{"daily", NewDate(2026, 12, 31), NewDate(2027, 1, 1)},
	}
	for _, c := range cases {
		r, err := ParseRepeat(c.rule)
		if err != nil {
			t.Fatal(err)
		}
		if got := r.After(c.from); got != c.want {
			t.Fatalf("%s after %v = %v, want %v", c.rule, c.from, got, c.want)
		}
	}
}

func TestDaysBetween(t *testing.T) {
	if n := DaysBetween(NewDate(2026, 3, 28), NewDate(2026, 3, 30)); n != 2 {
		t.Fatal(n)
	}
	if n := DaysBetween(NewDate(2026, 9, 25), NewDate(2026, 9, 20)); n != -5 {
		t.Fatal(n)
	}
}
