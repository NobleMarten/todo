package model

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestParseDate(t *testing.T) {
	tests := []struct {
		in      string
		want    Date
		wantErr bool
	}{
		{"2026-10-04", Date{2026, time.October, 4}, false},
		{"2024-02-29", Date{2024, time.February, 29}, false},
		{"2026-02-29", Date{}, true}, // не високосный
		{"04.10.2026", Date{}, true},
		{"2026-10-04T00:00:00Z", Date{}, true},
		{"", Date{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			got, err := ParseDate(tt.in)
			if tt.wantErr {
				if !errors.Is(err, ErrInvalidDate) {
					t.Fatalf("ParseDate(%q) err = %v, want ErrInvalidDate", tt.in, err)
				}
				return
			}
			if err != nil || got != tt.want {
				t.Fatalf("ParseDate(%q) = %v, %v; want %v", tt.in, got, err, tt.want)
			}
		})
	}
}

func TestDate_JSON(t *testing.T) {
	type wrap struct {
		D  Date  `json:"d"`
		P  *Date `json:"p"`
		NP *Date `json:"np"`
	}
	d := NewDate(2026, time.September, 21)
	b, err := json.Marshal(wrap{D: d, P: &d})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"d":"2026-09-21","p":"2026-09-21","np":null}`
	if string(b) != want {
		t.Fatalf("Marshal = %s, want %s", b, want)
	}

	var got wrap
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if got.D != d || got.P == nil || *got.P != d || got.NP != nil {
		t.Fatalf("Unmarshal round trip = %+v", got)
	}

	var bad wrap
	if err := json.Unmarshal([]byte(`{"d":"21.09.2026"}`), &bad); !errors.Is(err, ErrInvalidDate) {
		t.Fatalf("Unmarshal bad date err = %v, want ErrInvalidDate", err)
	}
	if err := json.Unmarshal([]byte(`{"d":20260921}`), &bad); !errors.Is(err, ErrInvalidDate) {
		t.Fatalf("Unmarshal number err = %v, want ErrInvalidDate", err)
	}
}

func TestDate_ZeroMarshalsAsNull(t *testing.T) {
	b, err := json.Marshal(Date{})
	if err != nil || string(b) != "null" {
		t.Fatalf("Marshal(zero) = %s, %v; want null", b, err)
	}
	v, err := Date{}.Value()
	if err != nil || v != nil {
		t.Fatalf("Value(zero) = %v, %v; want nil", v, err)
	}
}

func TestDate_Scan(t *testing.T) {
	msk := time.FixedZone("MSK", 3*60*60)
	tests := []struct {
		name string
		src  any
		want Date
	}{
		{"nil", nil, Date{}},
		// так pgx отдаёт колонку DATE
		{"utc midnight", time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC), NewDate(2026, 9, 21)},
		// день берётся в зоне самого значения, без сдвига через UTC
		{"msk midnight", time.Date(2026, 9, 21, 0, 30, 0, 0, msk), NewDate(2026, 9, 21)},
		{"string", "2026-09-21", NewDate(2026, 9, 21)},
		{"bytes", []byte("2026-09-21"), NewDate(2026, 9, 21)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := NewDate(1999, 1, 1) // Scan должен перезаписать, а не дописать
			if err := d.Scan(tt.src); err != nil {
				t.Fatal(err)
			}
			if d != tt.want {
				t.Fatalf("Scan(%v) = %v, want %v", tt.src, d, tt.want)
			}
		})
	}

	var d Date
	if err := d.Scan(42); err == nil {
		t.Fatal("Scan(int) err = nil, want error")
	}
	if err := d.Scan("not a date"); !errors.Is(err, ErrInvalidDate) {
		t.Fatalf("Scan(bad string) err = %v, want ErrInvalidDate", err)
	}
}

func TestDate_Value(t *testing.T) {
	v, err := NewDate(2026, 1, 5).Value()
	if err != nil || v != "2026-01-05" {
		t.Fatalf("Value = %v, %v; want 2026-01-05", v, err)
	}
}

func TestDate_Arithmetic(t *testing.T) {
	d := NewDate(2026, time.December, 31)
	if got := d.AddDays(1); got != NewDate(2027, time.January, 1) {
		t.Fatalf("AddDays(1) = %v", got)
	}
	if got := NewDate(2026, time.March, 1).AddDays(-1); got != NewDate(2026, time.February, 28) {
		t.Fatalf("AddDays(-1) = %v", got)
	}
	if got := NewDate(2026, time.September, 31); got != NewDate(2026, time.October, 1) {
		t.Fatalf("NewDate overflow = %v", got)
	}
	if !d.Before(d.AddDays(1)) || d.Before(d) || !d.AddDays(1).After(d) {
		t.Fatal("Before/After broken")
	}
}

func TestDateOf_UsesOwnLocation(t *testing.T) {
	// 23:30 UTC 20 сентября — это уже 21 сентября по Москве
	utc := time.Date(2026, 9, 20, 23, 30, 0, 0, time.UTC)
	msk, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		t.Skip("tzdata недоступна:", err)
	}
	if got := DateOf(utc); got != NewDate(2026, 9, 20) {
		t.Fatalf("DateOf(utc) = %v", got)
	}
	if got := DateOf(utc.In(msk)); got != NewDate(2026, 9, 21) {
		t.Fatalf("DateOf(msk) = %v", got)
	}
}
