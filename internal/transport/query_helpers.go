package transport

import (
	"errors"
	"net/http"
	"strconv"
	"time"
)

func ParseDate(r *http.Request) (from, to time.Time, ok bool, err error) {

	if r.URL.Query().Get("from") == "" || r.URL.Query().Get("to") == "" {
		return time.Time{}, time.Time{}, false, nil
	}
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	from, err = time.Parse("2006-01-02", fromStr)
	if err != nil {
		return time.Time{}, time.Time{}, false, errors.New("invalid from date parameter")
	}

	to, err = time.Parse("2006-01-02", toStr)
	if err != nil {
		return time.Time{}, time.Time{}, false, errors.New("invalid to date parameter")
	}
	return from, to, true, nil
}

func ParseDone(r *http.Request) (done bool, ok bool, err error) {
	if r.URL.Query().Get("done") == "" {
		return false, false, nil
	}
	doneStr := r.URL.Query().Get("done")

	done, err = strconv.ParseBool(doneStr)
	if err != nil {
		return false, false, errors.New("invalid done parameter")
	}
	return done, true, nil
}

func SortParse(r *http.Request) (sortBy, order string, ok bool, err error) {
	if r.URL.Query().Get("sort") == "" {
		return "", "", false, nil
	}
	sortBy = r.URL.Query().Get("sort")
	order = r.URL.Query().Get("order")

	if order == "" {
		order = "asc" // значение по умолчанию
	}

	if order != "asc" && order != "desc" {
		return "", "", false, errors.New("invalid order parameter")
	}
	return sortBy, order, true, nil
}

func ParsePaginate(r *http.Request) (limit int, offset int, ok bool, err error) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	if r.URL.Query().Get("limit") == "" || r.URL.Query().Get("offset") == "" {
		return 0, 0, false, nil
	}
	limit, err1 := strconv.Atoi(limitStr)
	offset, err2 := strconv.Atoi(offsetStr)

	if err1 != nil || err2 != nil {
		return 0, 0, false, errors.New("invalid limit or offset parameter")
	}
	return limit, offset, true, nil
}
