package model

import "time"

// User — владелец задач и списков. Регистрации в приложении нет: пользователей заводит
// команда `todo-api user add`.
type User struct {
	ID           int       `json:"id"`
	Login        string    `json:"login"`
	PasswordHash string    `json:"-"` // bcrypt; пусто — пароль не задан, войти нельзя
	CreatedAt    time.Time `json:"created_at"`
}
