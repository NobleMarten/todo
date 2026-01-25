package transport

import (
	"errors"
	"net/http"
	"todo/internal/model"
)

func WriteError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, model.ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound) //404

	case errors.Is(err, model.ErrInvalidID),
		errors.Is(err, model.ErrEmptyTitle),
		errors.Is(err, model.ErrNothingToUpdate),
		errors.Is(err, model.ErrAlreadyDone),
		errors.Is(err, model.ErrNotDone):
		http.Error(w, err.Error(), http.StatusBadRequest) //400

	default:
		http.Error(w, "internal server error", http.StatusInternalServerError) //500
	}
}
