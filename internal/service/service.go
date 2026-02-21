package service

import (
	"sort"
	"strings"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

type TaskService struct {
	repo storage.RepoStorage // интерфейс для взаимодействия с хранилищем данных (pos)
}

func NewTaskService(repo storage.RepoStorage) (*TaskService, error) {
	return &TaskService{repo: repo}, nil
}

func ValidateTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", model.ErrEmptyTitle
	}
	if len([]rune(title)) > 120 {
		return "", model.ErrTitleTooLong
	}
	return title, nil
}

func (s *TaskService) Add(title string) (model.Task, error) {

	title, err := ValidateTitle(title)
	if err != nil {
		return model.Task{}, err
	}

	return s.repo.Create(title)
}

func (s *TaskService) List() ([]model.Task, error) {
	return s.repo.List()
}

func (s *TaskService) Done(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	task, err := s.repo.GetByID(id)
	if err != nil {
		return model.Task{}, err
	}

	if task.Done {
		return model.Task{}, model.ErrAlreadyDone
	}

	return s.repo.Done(id)
}

func (s *TaskService) Undone(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	task, err := s.repo.GetByID(id)
	if err != nil {
		return model.Task{}, err
	}

	if !task.Done {
		return model.Task{}, model.ErrAlreadyUndone
	}

	return s.repo.Undone(id)
}

func (s *TaskService) Delete(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	return s.repo.Delete(id)
}

func (s *TaskService) GetByID(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	return s.repo.GetByID(id)
}

func (s *TaskService) Update(id int, title string) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	ValidateTitle(title)

	return s.repo.Update(id, title)
}

func (s *TaskService) Patch(id int, title *string, done *bool) (model.Task, error) {
	// атомарный - это когда все операции выполняются как единое целое, и если одна из них не может быть выполнена, то все операции отменяются. В данном случае, если мы не можем обновить заголовок или статус задачи, то мы не хотим вносить изменения в задачу. Поэтому мы выполняем все операции внутри одной функции, и если какая-то из них не может быть выполнена, то мы возвращаем ошибку и не вносим изменения в задачу.
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	ValidateTitle(*title)

	if title == nil && done == nil {
		return model.Task{}, model.ErrNothingToUpdate
	}

	return s.repo.Patch(id, title, done)
}

func (s *TaskService) Clear() error {
	return s.repo.Clear()
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
