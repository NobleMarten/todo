package main

import (
	"log"
	"net/http"
	"os"
	"todo/internal/service"
	"todo/internal/storage"
	"todo/internal/transport"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	db_url := os.Getenv("DB_URL")
	if db_url == "" {
		log.Fatal("DB_URL environment variable is not set")
	}
	repo, err := storage.NewPostgresRepo(db_url)
	if err != nil {
		log.Fatal(err, "failed to connect to database")
	}

	svc, err := service.NewTaskService(repo)
	if err != nil {
		log.Fatal(err)
	}

	h := transport.NewHandler(svc)

	mux := http.NewServeMux()

	mux.HandleFunc("/todos", h.Todos)       // Регистрируем обработчик (роут) для пути /todos.
	mux.HandleFunc("/todos/", h.Todos)      // Регистрируем обработчик для пути /todos/{id}.
	mux.HandleFunc("/todos/clear", h.Todos) // Регистрируем обработчик для пути /todos/clear.
	//http.HandleFunc("/todos/done", h.SetDone) // Регистрируем обработчик для пути /todos/done.

	// Запускаем HTTP-сервер на порту 8080.
	log.Println("API server started: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", corsMiddleware(mux))) // Логируем ошибку, если сервер не смог запуститься.
}
