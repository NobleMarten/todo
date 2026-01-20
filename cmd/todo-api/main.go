package main

import (
	"log"
	"net/http"
	"todo/internal/service"
	"todo/internal/storage"
	"todo/internal/transport"
)

func main() {
	store := storage.NewFileStorage("data/tasks.json")

	svc := service.NewTaskService(store)

	h := transport.NewHandler(svc)

	http.HandleFunc("/todos", h.Todos)        // Регистрируем обработчик (роут) для пути /todos.
	http.HandleFunc("/todos/", h.Todos)       // Регистрируем обработчик для пути /todos/{id}.
	http.HandleFunc("/todos/done", h.SetDone) // Регистрируем обработчик для пути /todos/done.

	// Запускаем HTTP-сервер на порту 8080.
	log.Println("API server started: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil)) // Логируем ошибку, если сервер не смог запуститься.
}
