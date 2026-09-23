package oldcod

// done
// Tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for i, t := range Tasks {
// 	if t.ID == id {

// 		if t.Done {
// 			return model.Task{}, model.ErrAlreadyDone
// 		}
// 		now := time.Now()
// 		Tasks[i].DoneAt = &now
// 		Tasks[i].Done = true
// 		err = s.store.Save(Tasks)
// 		if err != nil {
// 			return model.Task{}, err
// 		}
// 		return Tasks[i], nil
// 	}
// }
// return model.Task{}, model.ErrNotFound

// undone
// Tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for i, t := range Tasks {
// 	if t.ID == id {
// 		if !t.Done {
// 			return model.Task{}, model.ErrNotDone
// 		}
// 		Tasks[i].Done = false
// 		Tasks[i].DoneAt = nil
// 		err = s.store.Save(Tasks)
// 		if err != nil {
// 			return model.Task{}, err
// 		}
// 		return Tasks[i], nil
// 	}
// }

// return model.Task{}, model.ErrNotFound

//delete
// Tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }

// for i, t := range Tasks {
// 	if t.ID == id {
// 		// 4) удалить из среза (append(model.Tasks[:i], model.Tasks[i+1:]...))
// 		deletedTask := Tasks[i]
// 		Tasks = append(Tasks[:i], Tasks[i+1:]...) //... значит “вставь элементы второго среза поэлементно”, а не как один вложенный срез.
// 		err = s.store.Save(Tasks)
// 		if err != nil {
// 			return model.Task{}, err
// 		}
// 		return deletedTask, nil
// 	}
// }

//getbyid
// tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for _, t := range tasks {
// 	if t.ID == id {
// 		return t, nil
// 	}
// }
// return model.Task{}, model.ErrNotFound

//update
// tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for i, t := range tasks {
// 	if t.ID == id {
// 		tasks[i] = task
// 		break
// 	}
// }

// func (s *TaskService) mapToSlice() []model.Task {
// 	tasksSlice := make([]model.Task, 0, len(s.tasks))
// 	for _, task := range s.tasks {
// 		tasksSlice = append(tasksSlice, task)
// 	}
// 	return tasksSlice
// }

// test.go

// func TestDelete_Success(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 			{ID: 2, Title: "Task Two", Done: false},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Delete(1)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	for _, tsk := range tasks {
// 		if tsk.ID == 1 {
// 			t.Fatalf("expected task ID 1 to be deleted")
// 		}
// 	}
// }

// func TestDelete_NotFound(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Delete(2)
// 	if !errors.Is(err, model.ErrNotFound) {
// 		t.Fatalf("expected ErrNotFound, got %v", err)
// 	}
// }

// func TestDelete_InvalidID(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service := NewFakeTaskService(store)
// 	_, err := service.Delete(0)
// 	if !errors.Is(err, model.ErrInvalidID) {
// 		t.Fatalf("expected ErrInvalidID, got %v", err)
// 	}
// }

// func TestGetByID_Succes(t *testing.T) {
// 	store := &storage.FakeRepo{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service, err := NewTaskService(store)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
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
// 	store := &storage.FakeRepo{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service, err := NewTaskService(store)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	_, err = service.GetByID(2)
// 	if !errors.Is(err, model.ErrNotFound) {
// 		t.Fatalf("expected ErrNotFound, got %v", err)
// 	}
// }

// func TestGetByID_InvalidID(t *testing.T) {
// 	store := &storage.FakeRepo{
// 		Tasks: []model.Task{
// 			{ID: 1, Title: "Task One", Done: true},
// 		},
// 	}
// 	service, err := NewTaskService(store)
// 	if err != nil {
// 		t.Fatalf("unexpected error: %v", err)
// 	}
// 	_, err = service.GetByID(0)
// 	if !errors.Is(err, model.ErrInvalidID) {
// 		t.Fatalf("expected ErrInvalidID, got %v", err)
// 	}
// }
