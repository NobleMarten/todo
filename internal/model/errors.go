package model

import "errors"

var (
	ErrNotFound               = errors.New("task not found")
	ErrEmptyTitle             = errors.New("empty title")
	ErrInvalidID              = errors.New("invalid ID")
	ErrAlreadyDone            = errors.New("task already done")
	ErrAlreadyUndone          = errors.New("task already undone")
	ErrNotImplemented         = errors.New("not implemented")
	ErrNotDone                = errors.New("task not done")
	ErrNothingToUpdate        = errors.New("nothing to patch")
	ErrTitleTooLong           = errors.New("title too long")
	ErrNotAllowed             = errors.New("operation not allowed")
	ErrMissingDBURL           = errors.New("missing database URL")
	ErrInvalidShutdownTimeout = errors.New("invalid shutdown timeout")
)
