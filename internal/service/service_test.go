package service

import (
	"errors"
	"strings"
	"testing"
	"todo/internal/model"
	"todo/internal/storage"
)

func TestValidateTitle_Empty(t *testing.T) {
	_, err := ValidateTitle("")
	if !errors.Is(err, model.ErrEmptyTitle) {
		t.Fatalf("expected ErrEmptyTitle, got %v", err)
	}
}

func TestValidateTitle_Trimmed(t *testing.T) {
	title, err := ValidateTitle("   Hello   ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if title != "Hello" {
		t.Fatalf("expected 'Hello', got '%s'", title)
	}
}

func TestValidateTitle_TooLong(t *testing.T) {
	long := strings.Repeat("a", 121)
	_, err := ValidateTitle(long)
	if !errors.Is(err, model.ErrTitleTooLong) {
		t.Fatalf("expected ErrTitleTooLong, got %v", err)
	}
}

func TestAdd(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "One", Done: false},
		},
	}

	service := NewTaskService(store)
	task, err := service.Add("Second Task")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if task.ID != 2 {
		t.Fatalf("expected ID 2, got %d", task.ID)
	}
	if task.Title != "Second Task" {
		t.Fatalf("expected title 'New Task', got '%s'", task.Title)
	}
	tasks, err := store.Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("expected 1 task in storage, got %d", len(tasks))
	}
	if tasks[1].ID != task.ID {
		t.Fatalf("expected stored task ID %d, got %d", task.ID, tasks[0].ID)
	}
	if task.Done == true {
		t.Fatalf("expected task to be not done")
	}
	if err := service.store.Save([]model.Task{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestList(t *testing.T) {
	returnedTasks := []model.Task{
		{ID: 1, Title: "Task One", Done: false},
	}
	store := &storage.FakeStorage{
		List: returnedTasks,
	}
	service := NewTaskService(store)
	tasks, err := service.List()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tasks) != len(returnedTasks) {
		t.Fatalf("expected %d tasks, got %d", len(returnedTasks), len(tasks))
	}
}

func TestDone_Success(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: false},
			{ID: 2, Title: "Task Two", Done: false},
		},
	}
	service := NewTaskService(store)
	task, err := service.Done(2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if task.ID != 2 {
		t.Fatalf("expected ID 2, got %d", task.ID)
	}
	if !task.Done {
		t.Fatalf("expected task to be done")
	}
	tasks, err := store.Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, tsk := range tasks {
		if tsk.ID == 2 && !tsk.Done {
			t.Fatal("expected task ID 2 to be done in storage")
		}
		if tsk.ID == 2 && tsk.DoneAt == nil {
			t.Fatal("expected task ID 2 to have DoneAt set")
		}
	}
}

func TestDone_AlreadyDone(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: true},
		},
	}
	service := NewTaskService(store)
	_, err := service.Done(1)
	if !errors.Is(err, model.ErrAlreadyDone) {
		t.Fatalf("expected ErrAlreadyDone, got %v", err)
	}
}

func TestDone_NotFound(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: false},
		},
	}
	service := NewTaskService(store)
	_, err := service.Done(2)
	if !errors.Is(err, model.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDone_InvalidID(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: false},
		},
	}
	service := NewTaskService(store)
	_, err := service.Done(0)
	if !errors.Is(err, model.ErrInvalidID) {
		t.Fatalf("expected ErrInvalidID, got %v", err)
	}
}

func TestUndone_Success(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: true},
		},
	}
	service := NewTaskService(store)
	task, err := service.Undone(1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if task.ID != 1 {
		t.Fatalf("expected ID 1, got %d", task.ID)
	}
	if task.Done {
		t.Fatalf("expected task to be not done")
	}
	tasks, err := store.Load()
	for _, tsk := range tasks {
		if tsk.ID == 1 && tsk.Done {
			t.Fatal("expected task ID 1 to be not done in storage")
		}
		if tsk.ID == 1 && tsk.DoneAt != nil {
			t.Fatal("expected task ID 1 to have DoneAt nil")
		}
	}
}

func TestUndone_AlreadyUndone(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: false},
		},
	}
	service := NewTaskService(store)
	_, err := service.Undone(1)
	if !errors.Is(err, model.ErrNotDone) {
		t.Fatalf("expected ErrAlreadyUndone, got %v", err)
	}
}

func TestUndone_NotFound(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: true},
		},
	}
	service := NewTaskService(store)
	_, err := service.Undone(2)
	if !errors.Is(err, model.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestUndone_InvalidID(t *testing.T) {
	store := &storage.FakeStorage{
		List: []model.Task{
			{ID: 1, Title: "Task One", Done: true},
		},
	}
	service := NewTaskService(store)
	_, err := service.Undone(0)
	if !errors.Is(err, model.ErrInvalidID) {
		t.Fatalf("expected ErrInvalidID, got %v", err)
	}
}
