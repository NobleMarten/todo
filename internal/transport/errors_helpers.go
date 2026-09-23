package transport

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"todo/internal/model"
)

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// errorCodes — доменная ошибка → HTTP-статус и код для клиента. Проверяется по порядку через errors.Is.
var errorCodes = []struct {
	err    error
	status int
	code   string
}{
	{model.ErrNotAllowed, http.StatusNotFound, "METHOD_NOT_ALLOWED"},
	{model.ErrNotFound, http.StatusNotFound, "TASK_NOT_FOUND"},
	{model.ErrProjectNotFound, http.StatusNotFound, "PROJECT_NOT_FOUND"},
	{model.ErrInvalidID, http.StatusBadRequest, "INVALID_ID"},
	{model.ErrEmptyTitle, http.StatusBadRequest, "EMPTY_TITLE"},
	{model.ErrTitleTooLong, http.StatusBadRequest, "TITLE_TOO_LONG"},
	{model.ErrEmptyName, http.StatusBadRequest, "EMPTY_NAME"},
	{model.ErrInvalidColor, http.StatusBadRequest, "INVALID_COLOR"},
	{model.ErrInvalidPriority, http.StatusBadRequest, "INVALID_PRIORITY"},
	{model.ErrNothingToUpdate, http.StatusBadRequest, "NOTHING_TO_UPDATE"},
	{model.ErrAlreadyDone, http.StatusConflict, "ALREADY_DONE"},
	{model.ErrAlreadyUndone, http.StatusConflict, "ALREADY_UNDONE"},
	{model.ErrNotDone, http.StatusBadRequest, "NOT_DONE"},
	{model.ErrSubtaskTooDeep, http.StatusBadRequest, "SUBTASK_TOO_DEEP"},
	{model.ErrInvalidDate, http.StatusBadRequest, "INVALID_DATE"},
	{model.ErrInvalidView, http.StatusBadRequest, "INVALID_VIEW"},
	{model.ErrInvalidQuery, http.StatusBadRequest, "INVALID_QUERY"},
	{model.ErrInvalidBody, http.StatusBadRequest, "INVALID_BODY"},
}

// WriteError записывает ошибку в HTTP-ответ в формате JSON {code, message}.
// Неизвестные ошибки логируются и уходят клиенту как 500 без подробностей.
func WriteError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	res := ErrorResponse{Code: "INTERNAL_SERVER_ERROR", Message: "internal server error"}

	for _, e := range errorCodes {
		if errors.Is(err, e.err) {
			status = e.status
			res = ErrorResponse{Code: e.code, Message: err.Error()}
			break
		}
	}
	if status == http.StatusInternalServerError {
		log.Printf("internal server error: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(res); err != nil {
		log.Printf("write error response: %v", err)
	}
}
