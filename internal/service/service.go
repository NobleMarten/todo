package service

import (
	"sort"
	"strings"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

type TaskService struct {
	store storage.Storage
}

func NewTaskService(store storage.Storage) *TaskService {
	return &TaskService{store: store}
}

func (s *TaskService) Add(title string) (model.Task, error) {

	title = strings.TrimSpace(title)
	if title == "" {
		return model.Task{}, model.ErrEmptyTitle
	}

	Tasks, err := s.store.Load()
	if err != nil {
		return model.Task{}, err
	}

	nextID := 1
	if len(Tasks) > 0 {
		nextID = Tasks[len(Tasks)-1].ID + 1
	}

	t := model.Task{
		ID:        nextID,
		Title:     title,
		Done:      false,
		CreatedAt: time.Now(),
		DoneAt:    nil,
	}

	Tasks = append(Tasks, t)

	if err := s.store.Save(Tasks); err != nil {
		return model.Task{}, err
	}

	return t, nil
}

func (s *TaskService) List() ([]model.Task, error) {
	return s.store.Load()
}

func (s *TaskService) Done(id int) (model.Task, error) {
	// TODO:
	// 1) id>0 иначе ErrInvalidID
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}
	// 2) Load model.Tasks
	Tasks, err := s.store.Load()
	if err != nil {
		return model.Task{}, err
	}
	// 3) найти по ID, если нет -> ErrNotFound
	for i, t := range Tasks {
		if t.ID == id {
			// 4) если уже Done -> ErrAlreadyDone
			if t.Done {
				return model.Task{}, model.ErrAlreadyDone
			}
			// 5) выставить Done=true, DoneAt=now, Save
			now := time.Now()
			Tasks[i].DoneAt = &now
			Tasks[i].Done = true
			err = s.store.Save(Tasks)
			if err != nil {
				return model.Task{}, err
			}
			return Tasks[i], nil
		}
	}

	return model.Task{}, model.ErrNotFound
}

func (s *TaskService) Undone(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}
	Tasks, err := s.store.Load()
	if err != nil {
		return model.Task{}, err
	}
	for i, t := range Tasks {
		if t.ID == id {
			if !t.Done {
				return model.Task{}, model.ErrNotDone
			}
			Tasks[i].Done = false
			Tasks[i].DoneAt = nil
			err = s.store.Save(Tasks)
			if err != nil {
				return model.Task{}, err
			}
			return Tasks[i], nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (s *TaskService) Delete(id int) (model.Task, error) {
	// TODO:
	// 1) id>0 иначе ErrInvalidID
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}
	// 2) Load model.Tasks
	Tasks, err := s.store.Load()
	if err != nil {
		return model.Task{}, err
	}
	// 3) найти по ID, если нет -> ErrNotFound
	for i, t := range Tasks {
		if t.ID == id {
			// 4) удалить из среза (append(model.Tasks[:i], model.Tasks[i+1:]...))
			deletedTask := Tasks[i]
			Tasks = append(Tasks[:i], Tasks[i+1:]...) //... значит “вставь элементы второго среза поэлементно”, а не как один вложенный срез.
			// 5) Save
			err = s.store.Save(Tasks)
			if err != nil {
				return model.Task{}, err
			}
			return deletedTask, nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (s *TaskService) GetByID(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}
	tasks, err := s.store.Load()
	if err != nil {
		return model.Task{}, err
	}
	for _, t := range tasks {
		if t.ID == id {
			return t, nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (s *TaskService) Update(id int, title string) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	title = strings.TrimSpace(title)

	if title == "" {
		return model.Task{}, model.ErrEmptyTitle
	}

	task, err := s.GetByID(id)
	if err != nil {
		return model.Task{}, err
	}

	task.Title = title
	tasks, err := s.store.Load() // загрузка всех задач
	if err != nil {
		return model.Task{}, err
	}
	for i, t := range tasks {
		if t.ID == id {
			tasks[i] = task
			break
		}
	}
	err = s.store.Save(tasks) // сохранение обновленного списка задач
	if err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (s *TaskService) Patch(id int, title *string, done *bool) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	if title == nil && done == nil {
		return model.Task{}, model.ErrNothingToUpdate
	}
	if title != nil {
		_, err := s.Update(id, *title)
		if err != nil {
			return model.Task{}, err
		}
	}
	if done != nil {
		if *done {
			_, err := s.Done(id)
			if err != nil {
				return model.Task{}, err
			}
		} else {
			_, err := s.Undone(id)
			if err != nil {
				return model.Task{}, err
			}
		}
	}
	return s.GetByID(id)
}

func (s *TaskService) FilterByDate(tasks []model.Task, from, to time.Time) ([]model.Task, error) {
	tonext := to.Add(24 * time.Hour) // чтобы включить задачи, созданные в день "to"

	var filteredTasks []model.Task
	for _, t := range tasks {
		if (t.CreatedAt.After(from) || t.CreatedAt.Equal(from)) && (t.CreatedAt.Before(tonext) || t.CreatedAt.Equal(tonext)) { // проверка диапазона, включая границы
			filteredTasks = append(filteredTasks, t)
		}
	}
	return filteredTasks, nil
}

func (s *TaskService) FilterByDone(tasks []model.Task, done bool) ([]model.Task, error) {
	var filteredTasks []model.Task

	for _, t := range tasks {
		if t.Done == done {
			filteredTasks = append(filteredTasks, t)
		}
	}
	return filteredTasks, nil
}

func (s *TaskService) Paginate(tasks []model.Task, limit, offset int) ([]model.Task, error) {
	if offset > len(tasks) { // если смещение больше длины среза, возвращаем пустой срез
		return []model.Task{}, nil
	}
	end := offset + limit // вычисляем конечный индекс
	if end > len(tasks) { // если конечный индекс больше длины среза, корректируем его
		end = len(tasks)
	}
	return tasks[offset:end], nil
}

func (s *TaskService) SortTasks(tasks []model.Task, sortBy, order string) ([]model.Task, error) {
	switch sortBy {
	case "id":
		sort.Slice(tasks, func(i, j int) bool {
			if order == "asc" {
				return tasks[i].ID < tasks[j].ID
			} else {
				return tasks[i].ID > tasks[j].ID
			}
		})
	case "title":
		sort.Slice(tasks, func(i, j int) bool {
			if order == "asc" {
				return tasks[i].Title < tasks[j].Title
			} else {
				return tasks[i].Title > tasks[j].Title
			}
		})
	case "created_at":
		sort.Slice(tasks, func(i, j int) bool {
			if order == "asc" {
				return tasks[i].CreatedAt.Before(tasks[j].CreatedAt)
			} else {
				return tasks[i].CreatedAt.After(tasks[j].CreatedAt)
			}
		})
	}
	return tasks, nil
}
