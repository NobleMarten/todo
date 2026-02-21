package service

import (
	"errors"
	"strings"
	"testing"
	"todo/internal/model"
	"todo/internal/storage"
)

// TestValidateTitle

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

// TestAdd

func TestAdd(t *testing.T) {
	repo := &storage.FakeRepo{
		Tasks: []model.Task{
			{ID: 1, Title: "One", Done: false},
		},
	}

	service, err := NewTaskService(repo)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

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
	tasks, err := repo.Load()
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
	if err := repo.Save([]model.Task{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// // TestList

// func TestList(t *testing.T) {
// 	returnedTasks := []model.Task{
// 		{ID: 1, Title: "Task One", Done: false},
// 	}
// 	store := &storage.FakeRepo{
// 		Tasks: returnedTasks,
// 	}
// 	service, err := NewTaskService(store)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	tasks, err := service.Tasks() //
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	if len(tasks) != len(returnedTasks) {
// 		t.Fatalf("expected %d tasks, got %d", len(returnedTasks), len(tasks))
// 	}
// }

// // TestDone

// func TestDone_Success(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: false},
// 			{ID: 2, Title: "Task Two", Done: false},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	task, err := service.Done(2)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	if task.ID != 2 {
// 		t.Fatalf("expected ID 2, got %d", task.ID)
// 	}
// 	if !task.Done {
// 		t.Fatalf("expected task to be done")
// 	}
// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	t.Logf("Calling store.Load(), \ngot tasks: %+v", tasks)

// 	for _, tsk := range tasks {
// 		if tsk.ID == 2 && !tsk.Done {
// 			t.Fatal("expected task ID 2 to be done in storage")
// 		}
// 		if tsk.ID == 2 && tsk.DoneAt == nil {
// 			t.Fatal("expected task ID 2 to have DoneAt set")
// 		}
// 	}
// }

// func TestDone_AlreadyDone(t *testing.T) {
// 	store := &storage.FakeRepo{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewTaskService(store)
// 	_, err := service.Done(1)
// 	if !errors.Is(err, model.ErrAlreadyDone) {
// 		t.Fatalf("expected ErrAlreadyDone, got %v", err)
// 	}
// }

// func TestDone_NotFound(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: false},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Done(2)
// 	if !errors.Is(err, model.ErrNotFound) {
// 		t.Fatalf("expected ErrNotFound, got %v", err)
// 	}
// }

// func TestDone_InvalidID(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: false},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Done(0)
// 	if !errors.Is(err, model.ErrInvalidID) {
// 		t.Fatalf("expected ErrInvalidID, got %v", err)
// 	}
// }

// // TestUndone

// func TestUndone_Success(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	task, err := service.Undone(1)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	if task.ID != 1 {
// 		t.Fatalf("expected ID 1, got %d", task.ID)
// 	}
// 	if task.Done {
// 		t.Fatalf("expected task to be not done")
// 	}
// 	tasks, err := store.Load()
// 	for _, tsk := range tasks {
// 		if tsk.ID == 1 && tsk.Done {
// 			t.Fatal("expected task ID 1 to be not done in storage")
// 		}
// 		if tsk.ID == 1 && tsk.DoneAt != nil {
// 			t.Fatal("expected task ID 1 to have DoneAt nil")
// 		}
// 	}
// }

// func TestUndone_AlreadyUndone(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: false},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Undone(1)
// 	if !errors.Is(err, model.ErrNotDone) {
// 		t.Fatalf("expected ErrAlreadyUndone, got %v", err)
// 	}
// }

// func TestUndone_NotFound(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Undone(2)
// 	if !errors.Is(err, model.ErrNotFound) {
// 		t.Fatalf("expected ErrNotFound, got %v", err)
// 	}
// }

// func TestUndone_InvalidID(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Undone(0)
// 	if !errors.Is(err, model.ErrInvalidID) {
// 		t.Fatalf("expected ErrInvalidID, got %v", err)
// 	}
// }

// // TestDelete

// func TestDelete_TableDriven(t *testing.T) { // table-driven test
// 	cases := []struct {
// 		name    string
// 		id      int
// 		wantErr error
// 		wantLen int
// 	}{
// 		{name: "success delete", id: 1, wantErr: nil, wantLen: 1},
// 		{name: "not found", id: 3, wantErr: model.ErrNotFound, wantLen: 2},
// 		{name: "invalid id", id: 0, wantErr: model.ErrInvalidID, wantLen: 2},
// 	}

// 	for _, tc := range cases {
// 		t.Run(tc.name, func(t *testing.T) {
// 			store := &storage.FakeStorage{
// 				Tasks: []model.Task{
// 					{ID: 1, Title: "Task One", Done: true},
// 					{ID: 2, Title: "Task Two", Done: false},
// 				},
// 			}
// 			service := NewFakeTaskService(store)
// 			_, err := service.Delete(tc.id)
// 			if tc.wantErr == nil && err != nil {
// 				t.Fatalf("unexpected error: %v", err)
// 			}
// 			if tc.wantErr != nil && err == nil {
// 				t.Fatalf("expected error %v, got nil", tc.wantErr)
// 			}
// 			if !errors.Is(err, tc.wantErr) {
// 				t.Fatalf("expected error %v, got %v", tc.wantErr, err)
// 			}
// 			tasks, err := store.Load()
// 			if err != nil {
// 				t.Fatalf("unexpected error: %v", err)
// 			}
// 			for _, tsk := range tasks {
// 				if tc.wantErr == nil && tsk.ID == tc.id && tc.wantLen == 1 {
// 					t.Fatalf("expected task ID %d to be deleted", tc.id)
// 				}
// 			}
// 		})
// 	}
// }

// // func TestDelete_Success(t *testing.T) {
// // 	store := &storage.FakeStorage{
// // 		Tasks: []model.Task{
// // 			{ID: 1, Title: "Task One", Done: true},
// // 			{ID: 2, Title: "Task Two", Done: false},
// // 		},
// // 	}
// // 	service := NewFakeTaskService(store)
// // 	_, err := service.Delete(1)
// // 	if err != nil {
// // 		t.Fatalf("unexpected error: %v", err)
// // 	}
// // 	tasks, err := store.Load()
// // 	if err != nil {
// // 		t.Fatalf("unexpected error: %v", err)
// // 	}
// // 	for _, tsk := range tasks {
// // 		if tsk.ID == 1 {
// // 			t.Fatalf("expected task ID 1 to be deleted")
// // 		}
// // 	}
// // }

// // func TestDelete_NotFound(t *testing.T) {
// // 	store := &storage.FakeStorage{
// // 		Tasks: []model.Task{
// // 			{ID: 1, Title: "Task One", Done: true},
// // 		},
// // 	}
// // 	service := NewFakeTaskService(store)
// // 	_, err := service.Delete(2)
// // 	if !errors.Is(err, model.ErrNotFound) {
// // 		t.Fatalf("expected ErrNotFound, got %v", err)
// // 	}
// // }

// // func TestDelete_InvalidID(t *testing.T) {
// // 	store := &storage.FakeStorage{
// // 		Tasks: []model.Task{
// // 			{ID: 1, Title: "Task One", Done: true},
// // 		},
// // 	}
// // 	service := NewFakeTaskService(store)
// // 	_, err := service.Delete(0)
// // 	if !errors.Is(err, model.ErrInvalidID) {
// // 		t.Fatalf("expected ErrInvalidID, got %v", err)
// // 	}
// // }

// // TestGetByID

// func TestGetByID_Succes(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	task, err := service.GetByID(1)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	tasks, err := store.Load()
// 	for _, tsk := range tasks {
// 		if tsk.ID != task.ID {
// 			t.Fatalf("expected ID %d, got %d", tsk.ID, task.ID)
// 		}
// 	}
// }

// func TestGetByID_NotFound(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.GetByID(2)
// 	if !errors.Is(err, model.ErrNotFound) {
// 		t.Fatalf("expected ErrNotFound, got %v", err)
// 	}
// }

// func TestGetByID_InvalidID(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.GetByID(0)
// 	if !errors.Is(err, model.ErrInvalidID) {
// 		t.Fatalf("expected ErrInvalidID, got %v", err)
// 	}
// }

// // TestPatch

// func NewTestStore_info() *storage.FakeStorage {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: false},
// 			{ID: 2, Title: "Task Two", Done: true},
// 		},
// 	}
// 	return store
// }

// func TestPatch_Success(t *testing.T) {
// 	store := NewTestStore_info()
// 	service := NewFakeTaskService(store)
// 	newTitle := "Updated Task"
// 	setTrue := true
// 	task, err := service.Patch(1, &newTitle, &setTrue)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	if task.Title != "Updated Task" {
// 		t.Fatalf("expected title 'Updated Task', got '%s'", task.Title)
// 	}
// 	if !task.Done {
// 		t.Fatalf("expected task to be done")
// 	}
// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	found := false
// 	for _, tsk := range tasks {
// 		if tsk.ID == 1 {
// 			found = true
// 			if tsk.Title != "Updated Task" {
// 				t.Fatalf("expected stored title 'Updated Task', got '%s'", tsk.Title)
// 			}
// 			if !tsk.Done {
// 				t.Fatalf("expected stored task to be done")
// 			}
// 			if tsk.DoneAt == nil {
// 				t.Fatalf("expected stored task DoneAt to be set")
// 			}
// 		}
// 	}
// 	if !found {
// 		t.Fatalf("task ID 1 not found in storage")
// 	}
// }

// func TestPatch_NothingToUpdate(t *testing.T) {
// 	store := NewTestStore_info()
// 	service := NewFakeTaskService(store)
// 	_, err := service.Patch(1, nil, nil)
// 	if !errors.Is(err, model.ErrNothingToUpdate) {
// 		t.Fatalf("expected ErrNothingToUpdate, got %v", err)
// 	}
// }

// func TestPatch_InvalidID(t *testing.T) {
// 	store := NewTestStore_info()
// 	service := NewFakeTaskService(store)
// 	_, err := service.Patch(0, nil, nil)
// 	if !errors.Is(err, model.ErrInvalidID) {
// 		t.Fatalf("expected ErrInvalidID, got %v", err)
// 	}
// }

// func TestPatch_Title(t *testing.T) {
// 	store := NewTestStore_info()
// 	service := NewFakeTaskService(store)
// 	newTitle := "Patched Title"
// 	task, err := service.Patch(1, &newTitle, nil)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	if task.Title != "Patched Title" {
// 		t.Fatalf("expected title 'Patched Title', got '%s'", task.Title)
// 	}
// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	found := false
// 	for _, tsk := range tasks {
// 		if tsk.ID == 1 {
// 			found = true
// 			if tsk.Title != "Patched Title" {
// 				t.Fatalf("expected stored title 'Patched Title', got '%s'", tsk.Title)
// 			}
// 		}
// 	}
// 	if !found {
// 		t.Fatalf("task ID 1 not found in storage")
// 	}
// }

// func TestPatch_Done(t *testing.T) {
// 	store := NewTestStore_info()
// 	service := NewFakeTaskService(store)
// 	newTrue := true
// 	task, err := service.Patch(1, nil, &newTrue)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	if task.Done != true {
// 		t.Fatalf("expected Done, got '%s'", task.Title)
// 	}
// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	found := false
// 	for _, tsk := range tasks {
// 		if tsk.ID == 1 {
// 			found = true
// 			if tsk.Done != true {
// 				t.Fatalf("expected stored Done, got '%v'", tsk.Done)
// 			}
// 			if tsk.DoneAt == nil {
// 				t.Fatalf("expected stored DoneAt to be set")
// 			}
// 		}
// 	}
// 	if !found {
// 		t.Fatalf("task ID 1 not found in storage")
// 	}
// }
