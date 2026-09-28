package transport

import "net/http"

// StatsSummary — GET /stats/summary?from=&to=: итоги периода, сравнение с прошлым периодом, бэклог.
// Без параметров — последние 30 дней до сегодня.
func (h *Handler) StatsSummary(w http.ResponseWriter, r *http.Request, userID int) {
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
	summary, err := h.tasks.Summary(r.Context(), userID, from, to)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}
