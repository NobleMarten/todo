package transport

import (
	"net/http"
	"todo/internal/model"
)

type PlanDayRequest struct {
	Date   model.Date `json:"date"`
	Add    []int      `json:"add"`
	Remove []int      `json:"remove"`
}

// GetDay — GET /day?date=YYYY-MM-DD: сборка экрана «Сегодня». Без date — сегодня в APP_TZ.
func (h *Handler) GetDay(w http.ResponseWriter, r *http.Request) {
	date, err := queryDate(r.URL.Query(), "date")
	if err != nil {
		WriteError(w, err)
		return
	}
	day, err := h.day.Day(r.Context(), date)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, day)
}

// GetWeek — GET /day/week?from=: экран «Неделя», семь дней с from (без него — с понедельника текущей недели).
func (h *Handler) GetWeek(w http.ResponseWriter, r *http.Request) {
	from, err := queryDate(r.URL.Query(), "from")
	if err != nil {
		WriteError(w, err)
		return
	}
	week, err := h.day.Week(r.Context(), from)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, week)
}

// GetSuggestions — GET /day/suggestions?date=: материал для «Собрать день».
func (h *Handler) GetSuggestions(w http.ResponseWriter, r *http.Request) {
	date, err := queryDate(r.URL.Query(), "date")
	if err != nil {
		WriteError(w, err)
		return
	}
	s, err := h.day.Suggestions(r.Context(), date)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (h *Handler) PlanDay(w http.ResponseWriter, r *http.Request) {
	var req PlanDayRequest
	if err := decodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	if err := h.day.Plan(r.Context(), req.Date, req.Add, req.Remove); err != nil {
		WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Activity — GET /stats/activity?from=&to=: [{date, done}] для грида активности.
func (h *Handler) Activity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, err := queryDate(q, "from")
	if err != nil {
		WriteError(w, err)
		return
	}
	to, err := queryDate(q, "to")
	if err != nil {
		WriteError(w, err)
		return
	}
	days, err := h.tasks.Activity(r.Context(), from, to)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, days)
}
