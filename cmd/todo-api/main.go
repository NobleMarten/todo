package main

import (
	"log"
	"net/http"
	"todo/internal/service"
	"todo/internal/storage"
	"todo/internal/transport"
)

func main() {
	// repo := storage.NewFileRepo("data/tasks.json")
	// repo, err := storage.NewPostgresRepo("postgres://noblemarten:jK2006Kbv21s@localhost:5432/todo_db?sslmode=disable")
	repo, err := storage.NewPostgresRepo("DB_URL")
	if err != nil {
		log.Fatal(err, "failed to connect to database")
	}

	svc, err := service.NewTaskService(repo)
	if err != nil {
		log.Fatal(err)
	}

	h := transport.NewHandler(svc)

	http.HandleFunc("/todos", h.Todos)       // Регистрируем обработчик (роут) для пути /todos.
	http.HandleFunc("/todos/", h.Todos)      // Регистрируем обработчик для пути /todos/{id}.
	http.HandleFunc("/todos/clear", h.Todos) // Регистрируем обработчик для пути /todos/clear.
	//http.HandleFunc("/todos/done", h.SetDone) // Регистрируем обработчик для пути /todos/done.

	// Запускаем HTTP-сервер на порту 8080.
	log.Println("API server started: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil)) // Логируем ошибку, если сервер не смог запуститься.
}
