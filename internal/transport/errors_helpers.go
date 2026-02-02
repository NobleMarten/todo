package transport

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"todo/internal/model"
)

func WriteError(w http.ResponseWriter, err error) { // Функция WriteError записывает ошибку в HTTP-ответ в формате JSON.
	var status int
	var res ErrorResponse

	switch {
	case errors.Is(err, model.ErrNotFound):
		status = http.StatusNotFound
		res = ErrorResponse{
			Code:    "TASK_NOT_FOUND",
			Message: err.Error(),
		}

	case errors.Is(err, model.ErrInvalidID):
		status = http.StatusBadRequest
		res = ErrorResponse{
			Code:    "INVALID_ID",
			Message: err.Error(),
		}
	case errors.Is(err, model.ErrEmptyTitle):
		status = http.StatusBadRequest
		res = ErrorResponse{
			Code:    "EMPTY_TITLE",
			Message: err.Error(),
		}
	case errors.Is(err, model.ErrNothingToUpdate):
		status = http.StatusBadRequest
		res = ErrorResponse{
			Code:    "NOTHING_TO_UPDATE",
			Message: err.Error(),
		}
	case errors.Is(err, model.ErrAlreadyDone):
		status = http.StatusBadRequest
		res = ErrorResponse{
			Code:    "ALREADY_DONE",
			Message: err.Error(),
		}
	case errors.Is(err, model.ErrNotDone):
		status = http.StatusBadRequest
		res = ErrorResponse{
			Code:    "NOT_DONE",
			Message: err.Error(),
		}

	default:
		status = http.StatusInternalServerError
		log.Printf("internal server error: %v", err)
		res = ErrorResponse{
			Code:    "INTERNAL_SERVER_ERROR",
			Message: "internal server error",
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(res); err != nil {
		http.Error(w, "internal server error", status)
	}
}
