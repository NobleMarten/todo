package model

import "time"

// Project — список задач. Задачи без project_id считаются «Входящими».
type Project struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	Position  int       `json:"position"`
	Archived  bool      `json:"archived"`
	CreatedAt time.Time `json:"created_at"`
}
