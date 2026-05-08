package storage

import (
	"time"
	"todo/internal/model"
)

type FakeRepo struct {
	Tasks []model.Task
}

// func (fs *FakeStorage) Load() ([]model.Task, error) {
// 	test_list := make([]model.Task, len(fs.List))
// 	copy(test_list, fs.List)
// 	return test_list, nil
// }

// func (fs *FakeStorage) Save(tasks []model.Task) error {
// 	fs.List = tasks
// 	return nil
// }

func (fr *FakeRepo) Load() ([]model.Task, error) {
	test_list := make([]model.Task, len(fr.Tasks))
	copy(test_list, fr.Tasks)
	return test_list, nil
}

func (fr *FakeRepo) Save(tasks []model.Task) error {
	fr.Tasks = tasks
	return nil
}

func (fr *FakeRepo) Create(title string, priority string) (model.Task, error) {
	nextID := 1
	for _, task := range fr.Tasks {
		if task.ID >= nextID {
			nextID = task.ID + 1
		}
	}

	newTask := model.Task{
		ID:       nextID,
		Title:    title,
		Done:     false,
		Priority: priority,
	}

	fr.Tasks = append(fr.Tasks, newTask)
	return newTask, nil
}

func (fr *FakeRepo) List() ([]model.Task, error) {
	test_list := make([]model.Task, len(fr.Tasks))
	copy(test_list, fr.Tasks)
	return test_list, nil
}

func (fr *FakeRepo) Done(id int) (model.Task, error) {
	now := time.Now()
	for i, task := range fr.Tasks {
		if task.ID == id {
			if task.Done {
				return model.Task{}, model.ErrAlreadyDone
			}
			fr.Tasks[i].Done = true
			fr.Tasks[i].DoneAt = &now
			return fr.Tasks[i], nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (fr *FakeRepo) Undone(id int) (model.Task, error) {
	for i, task := range fr.Tasks {
		if task.ID == id {
			if !task.Done {
				return model.Task{}, model.ErrAlreadyUndone
			}
			fr.Tasks[i].Done = false
			fr.Tasks[i].DoneAt = nil
			return fr.Tasks[i], nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (fr *FakeRepo) Delete(id int) (model.Task, error) {
	for i, task := range fr.Tasks {
		if task.ID == id {
			deletedTask := fr.Tasks[i]
			fr.Tasks = append(fr.Tasks[:i], fr.Tasks[i+1:]...)
			return deletedTask, nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (fr *FakeRepo) GetByID(id int) (model.Task, error) {
	for _, task := range fr.Tasks {
		if task.ID == id {
			return task, nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (fr *FakeRepo) Update(id int, title string) (model.Task, error) {
	for i, task := range fr.Tasks {
		if task.ID == id {
			fr.Tasks[i].Title = title
			return fr.Tasks[i], nil
		}
	}
	return model.Task{}, model.ErrNotFound
}

func (fr *FakeRepo) Patch(id int, title *string, done *bool, priority *string) (model.Task, error) {
	for i, ts := range fr.Tasks {
		if ts.ID == id {
			if title != nil {
				fr.Tasks[i].Title = *title
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
				fr.Tasks[i].Priority = *priority
			}
			return fr.Tasks[i], nil
		}
	}
	return model.Task{}, nil
}

func (fr *FakeRepo) Clear() error {
	fr.Tasks = []model.Task{}
	return nil
}
