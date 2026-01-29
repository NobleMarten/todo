package storage

import "todo/internal/model"

type FakeStorage struct {
	List []model.Task
}

func (fs *FakeStorage) Load() ([]model.Task, error) {
	test_list := make([]model.Task, len(fs.List))
	copy(test_list, fs.List)
	return test_list, nil
}

func (fs *FakeStorage) Save(tasks []model.Task) error {
	fs.List = tasks
	return nil
}
