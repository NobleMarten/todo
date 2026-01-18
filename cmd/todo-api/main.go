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

	http.HandleFunc("/todos", h.Todos) // роут Регистрируем обработчик для пути /todos.

	// Запускаем HTTP-сервер на порту 8080.
	log.Println("API server started: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil)) // Логируем ошибку, если сервер не смог запуститься.

}
