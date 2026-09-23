package storage

import (
	"encoding/json"
	"errors"
	"os"
	"todo/internal/model"
)

type Storage interface {
	Load() ([]model.Task, error)
	Save([]model.Task) error
}

type FileStorage struct {
	path string
}

func NewFileStorage(path string) *FileStorage {
	return &FileStorage{path: path}
}

func (fs *FileStorage) Load() ([]model.Task, error) {
	data, err := os.ReadFile(fs.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []model.Task{}, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return []model.Task{}, nil
	}
	var tasks []model.Task
	err = json.Unmarshal(data, &tasks)
	if err != nil {
		return nil, err
	}
	return tasks, nil
}

func (fs *FileStorage) Save(tasks []model.Task) error {
	data, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(fs.path, data, 0644); err != nil {
		return err
	}
	return nil
}
