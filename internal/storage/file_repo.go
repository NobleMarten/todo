package storage

import (
	"time"
	"todo/internal/model"
)

type RepoStorage interface {
	Create(title string, priority string) (model.Task, error)
	GetByID(id int) (model.Task, error)
	List() ([]model.Task, error)
	Update(id int, title string) (model.Task, error)
	Done(id int) (model.Task, error)
	Undone(id int) (model.Task, error)
	Delete(id int) (model.Task, error)
	Patch(id int, title *string, done *bool, priority *string) (model.Task, error)
	Clear() error
}

type FileRepo struct {
	fs *FileStorage // внутри FileRepo хранится указатель на FileStorage, который используется для загрузки и сохранения задач в файл.
	// path string
}

func NewFileRepo(path string) *FileRepo {
	return &FileRepo{fs: NewFileStorage(path)}
}

func (fr *FileRepo) Create(title string, priority string) (model.Task, error) {
	tasks, err := fr.fs.Load()
	if err != nil {
		return model.Task{}, err
	}

	nextID := 1
	for _, ts := range tasks {
		if ts.ID >= nextID {
			nextID = ts.ID + 1
		}
	}

	newTask := model.Task{
		ID:        nextID,
		Title:     title,
		Done:      false,
		Priority:  priority,
		CreatedAt: time.Now(),
	}

	tasks = append(tasks, newTask)
	if err := fr.fs.Save(tasks); err != nil {
		return model.Task{}, err
	}
	return newTask, nil
}

func (fr *FileRepo) List() ([]model.Task, error) {
	return fr.fs.Load()
}

func (fr *FileRepo) Done(id int) (model.Task, error) {
	tasks, err := fr.fs.Load()
	if err != nil {
		return model.Task{}, err
	}

	now := time.Now()

	for i, ts := range tasks {
		if ts.ID == id {
			tasks[i].Done = true
			tasks[i].DoneAt = &now // ссылка нужна для того, чтобы сохранить значение времени в структуре Task, так как DoneAt имеет тип *time.Time. Если мы присвоим значение времени напрямую, то оно будет скопировано, и изменения не будут сохранены в структуре Task. С помощью ссылки мы сохраняем указатель на значение времени, и изменения будут сохранены в структуре Task.
			if err := fr.fs.Save(tasks); err != nil {
				return model.Task{}, err
			}
			return ts, nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (fr *FileRepo) Undone(id int) (model.Task, error) {
	tasks, err := fr.fs.Load()
	if err != nil {
		return model.Task{}, err
	}

	for i, ts := range tasks {
		if ts.ID == id {
			tasks[i].Done = false
			tasks[i].DoneAt = nil
			if err := fr.fs.Save(tasks); err != nil {
				return model.Task{}, err
			}
			return ts, nil
		}
	}
	return model.Task{}, nil
}

func (fr *FileRepo) Delete(id int) (model.Task, error) {
	tasks, err := fr.fs.Load()
	if err != nil {
		return model.Task{}, err
	}

	for i, ts := range tasks {
		if ts.ID == id {
			tasks = append(tasks[:i], tasks[i+1:]...) // удаление элемента из слайса по индексу
			if err := fr.fs.Save(tasks); err != nil {
				return ts, err
			}
		}
	}
	return model.Task{}, nil
}

func (fr *FileRepo) GetByID(id int) (model.Task, error) {
	tasks, err := fr.fs.Load()
	if err != nil {
		return model.Task{}, err
	}

	for _, ts := range tasks {
		if ts.ID == id {
			return ts, nil
		}
	}
	return model.Task{}, nil
}

func (fr *FileRepo) Update(id int, title string) (model.Task, error) {
	tasks, err := fr.fs.Load()
	if err != nil {
		return model.Task{}, err
	}

	for _, ts := range tasks {
		if ts.ID == id {
			ts.Title = title
			if err := fr.fs.Save(tasks); err != nil {
				return ts, err
			}
		}
	}
	return model.Task{}, nil
}

func (fr *FileRepo) Patch(id int, title *string, done *bool, priority *string) (model.Task, error) {
	tasks, err := fr.fs.Load()
	if err != nil {
		return model.Task{}, err
	}

	for i, ts := range tasks {
		if ts.ID == id {
			if title != nil {
				tasks[i].Title = *title
			}
			if done != nil {
				if *done {
					_, err := fr.Done(id)
					if err != nil {
						return model.Task{}, err
					}
				} else {
					_, err := fr.Undone(id)
					if err != nil {
						return model.Task{}, err
					}
				}
			}
			if priority != nil {
				tasks[i].Priority = *priority
			}
			if err := fr.fs.Save(tasks); err != nil {
				return ts, err
			}
		}
	}
	return model.Task{}, nil
}

func (fr *FileRepo) Clear() error {
	return fr.fs.Save([]model.Task{})
}
