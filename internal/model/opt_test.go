package model

import (
	"encoding/json"
	"testing"
)

func TestOpt_ThreeStates(t *testing.T) {
	type patch struct {
		Title   Opt[string] `json:"title"`
		DueDate Opt[Date]   `json:"due_date"`
	}
	tests := []struct {
		name      string
		body      string
		wantSet   bool
		wantValue *Date
	}{
		{"absent", `{"title":"x"}`, false, nil},
		{"null", `{"due_date":null}`, true, nil},
		{"value", `{"due_date":"2026-10-04"}`, true, &Date{2026, 10, 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var p patch
			if err := jsonUnmarshal(tt.body, &p); err != nil {
				t.Fatal(err)
			}
			if p.DueDate.Set != tt.wantSet {
				t.Fatalf("Set = %v, want %v", p.DueDate.Set, tt.wantSet)
			}
			switch {
			case tt.wantValue == nil && p.DueDate.Value != nil:
				t.Fatalf("Value = %v, want nil", *p.DueDate.Value)
			case tt.wantValue != nil && (p.DueDate.Value == nil || *p.DueDate.Value != *tt.wantValue):
				t.Fatalf("Value = %v, want %v", p.DueDate.Value, *tt.wantValue)
			}
		})
	}
}

func TestOpt_Value(t *testing.T) {
	var p struct {
		Title Opt[string] `json:"title"`
		N     Opt[int]    `json:"n"`
	}
	if err := jsonUnmarshal(`{"title":"купить хлеб","n":0}`, &p); err != nil {
		t.Fatal(err)
	}
	if !p.Title.Set || p.Title.Value == nil || *p.Title.Value != "купить хлеб" {
		t.Fatalf("Title = %+v", p.Title)
	}
	// нулевое значение — это «прислали 0», а не «не прислали»
	if !p.N.Set || p.N.Value == nil || *p.N.Value != 0 {
		t.Fatalf("N = %+v", p.N)
	}
}

func TestOpt_InvalidInner(t *testing.T) {
	var p struct {
		N Opt[int]  `json:"n"`
		D Opt[Date] `json:"d"`
	}
	if err := jsonUnmarshal(`{"n":"abc"}`, &p); err == nil {
		t.Fatal("want error for string into Opt[int]")
	}
	if err := jsonUnmarshal(`{"d":"2026-13-01"}`, &p); err == nil {
		t.Fatal("want error for bad date")
	}
}

func jsonUnmarshal(s string, v any) error { return json.Unmarshal([]byte(s), v) }
