package service

import (
	"sort"
	"strings"
	"sync"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

type TaskService struct {
	store storage.Storage    // интерфейс для взаимодействия с хранилищем данных
	tasks map[int]model.Task // мапа для хранения задач, где ключ - это ID задачи, а значение - это сама задача. Мапа обеспечивает быстрый доступ к задачам по их ID.
	mu    sync.RWMutex       // для обеспечения безопасности при конкурентном доступе к tasks
}

func NewTaskService(store storage.Storage) (*TaskService, error) {
	task_slice, err := store.Load()
	if err != nil {
		return nil, err
	}

	task_map := make(map[int]model.Task)

	for _, t := range task_slice {
		task_map[t.ID] = t
	}

	return &TaskService{
		store: store,
		tasks: task_map,
	}, nil
}

func NewFakeTaskService(store storage.Storage) *TaskService {
	task_slice, _ := store.Load()

	task_map := make(map[int]model.Task)

	for _, t := range task_slice {
		task_map[t.ID] = t
	}

	return &TaskService{
		store: store,
		tasks: task_map,
	}
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

func (s *TaskService) mapToSlice() []model.Task {
	tasksSlice := make([]model.Task, 0, len(s.tasks))
	for _, task := range s.tasks {
		tasksSlice = append(tasksSlice, task)
	}
	return tasksSlice
}

func (s *TaskService) Add(title string) (model.Task, error) {

	title, err := ValidateTitle(title)
	if err != nil {
		return model.Task{}, err
	}

	s.mu.Lock()         // блокируем мапу на запись для безопасного доступа
	defer s.mu.Unlock() // разблокируем мапу после завершения функции

	nextID := 1
	for id := range s.tasks {
		if id >= nextID {
			nextID = id + 1
		}
	}

	t := model.Task{
		ID:        nextID,
		Title:     title,
		Done:      false,
		CreatedAt: time.Now(),
		DoneAt:    nil,
	}

	s.tasks[t.ID] = t

	Tasks := s.mapToSlice() // преобразование мапы в срез для сохранения

	if err := s.store.Save(Tasks); err != nil {
		return model.Task{}, err
	}

	return t, nil
}

func (s *TaskService) List() ([]model.Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tasksSlice := s.mapToSlice()

	sort.Slice(tasksSlice, func(i, j int) bool {
		return tasksSlice[i].ID < tasksSlice[j].ID
	})

	return tasksSlice, nil
}

func (s *TaskService) Done(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	task, ok := s.tasks[id] // проверка наличия задачи в мапе
	if !ok {
		return model.Task{}, model.ErrNotFound
	}

	if task.Done {
		return model.Task{}, model.ErrAlreadyDone
	}
	task.Done = true
	now := time.Now()
	task.DoneAt = &now
	s.tasks[id] = task      // обновление задачи в мапе
	tasks := s.mapToSlice() // преобразование мапы в срез для сохранения
	if err := s.store.Save(tasks); err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (s *TaskService) Undone(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	task, ok := s.tasks[id]
	if !ok {
		return model.Task{}, model.ErrNotFound
	}

	if !task.Done {
		return model.Task{}, model.ErrNotDone
	}

	task.Done = false
	task.DoneAt = nil

	s.tasks[id] = task

	tasks := s.mapToSlice()
	if err := s.store.Save(tasks); err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (s *TaskService) Delete(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, ok := s.tasks[id]
	if !ok {
		return model.Task{}, model.ErrNotFound
	}

	result := s.tasks[id]

	delete(s.tasks, id)     // удаление задачи из мапы с помощью встроенной функции delete из библиотеки Go
	tasks := s.mapToSlice() // преобразование мапы в срез для сохранения
	if err := s.store.Save(tasks); err != nil {
		return model.Task{}, err
	}
	return result, nil
}

func (s *TaskService) GetByID(id int) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	task, ok := s.tasks[id]
	if !ok {
		return model.Task{}, model.ErrNotFound
	}
	return task, nil
}

func (s *TaskService) Update(id int, title string) (model.Task, error) {
	if id <= 0 {
		return model.Task{}, model.ErrInvalidID
	}

	title, err := ValidateTitle(title)
	if err != nil {
		return model.Task{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	task, ok := s.tasks[id]
	if !ok {
		return model.Task{}, model.ErrNotFound
	}

	task.Title = title
	s.tasks[id] = task

	tasks := s.mapToSlice() // преобразование мапы в срез для сохранения

	if err := s.store.Save(tasks); err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (s *TaskService) Patch(id int, title *string, done *bool) (model.Task, error) {
	// не атомарный, но так как в рамках одного запроса будет работать только один горутин, то проблем с конкурентностью не будет
	// атомарный - это когда все операции выполняются как единое целое, и если одна из них не может быть выполнена, то все операции отменяются. В данном случае, если мы не можем обновить заголовок или статус задачи, то мы не хотим вносить изменения в задачу. Поэтому мы выполняем все операции внутри одной функции, и если какая-то из них не может быть выполнена, то мы возвращаем ошибку и не вносим изменения в задачу.
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

func (s *TaskService) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.tasks = make(map[int]model.Task)

	tasks := s.mapToSlice()
	if err := s.store.Save(tasks); err != nil {
		return err
	}

	return nil
}
