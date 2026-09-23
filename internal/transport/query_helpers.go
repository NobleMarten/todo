package transport

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"todo/internal/model"
)

const maxBodyBytes = 1 << 20

// Хелперы разбора возвращают nil, если параметр не передан, и ошибку с доменным кодом,
// если передан, но битый: хендлеру остаётся только WriteError.

func queryDate(q url.Values, key string) (*model.Date, error) {
	s := q.Get(key)
	if s == "" {
		return nil, nil
	}
	d, err := model.ParseDate(s)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", key, err)
	}
	return &d, nil
}

func queryInt(q url.Values, key string) (*int, error) {
	s := q.Get(key)
	if s == "" {
		return nil, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return nil, fmt.Errorf("%w: %s=%q", model.ErrInvalidQuery, key, s)
	}
	return &n, nil
}

func queryBool(q url.Values, key string) (*bool, error) {
	s := q.Get(key)
	if s == "" {
		return nil, nil
	}
	b, err := strconv.ParseBool(s)
	if err != nil {
		return nil, fmt.Errorf("%w: %s=%q", model.ErrInvalidQuery, key, s)
	}
	return &b, nil
}

// pathID достаёт {id} из пути; всё, что не число, — INVALID_ID.
func pathID(r *http.Request) (int, error) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		return 0, fmt.Errorf("%w: %q", model.ErrInvalidID, r.PathValue("id"))
	}
	return id, nil
}

// decodeJSON читает тело запроса. Битая дата остаётся INVALID_DATE, всё остальное — INVALID_BODY.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	err := json.NewDecoder(r.Body).Decode(v)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, model.ErrInvalidDate):
		return err
	case errors.Is(err, io.EOF):
		return fmt.Errorf("%w: empty body", model.ErrInvalidBody)
	default:
		return fmt.Errorf("%w: %v", model.ErrInvalidBody, err)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// заголовок уже ушёл, поменять статус нельзя — только залогировать
		log.Printf("encode response: %v", err)
	}
}
