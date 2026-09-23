package model

import "time"

// Project — список задач. Задачи без project_id считаются «Входящими».
type Project struct {
	ID        int            `json:"id"`
	Name      string         `json:"name"`
	Color     string         `json:"color"`
	Position  int            `json:"position"`
	Archived  bool           `json:"archived"`
	CreatedAt time.Time      `json:"created_at"`
	Counts    *ProjectCounts `json:"counts,omitempty"` // только в GET /projects
}

// ProjectCounts — счётчики корневых невыполненных задач списка для экрана «Списки».
type ProjectCounts struct {
	Active  int `json:"active"`
	Overdue int `json:"overdue"`
}
