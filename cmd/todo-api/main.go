package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"todo/internal/config"
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
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db_url := cfg.DB.URL
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

	srv := &http.Server{ // Создаем новый HTTP-сервер.
		Addr:    ":" + cfg.Port,      // Указываем адрес и порт, на котором будет работать сервер (например, ":8080").
		Handler: corsMiddleware(mux), // Устанавливаем обработчик для сервера, который будет обрабатывать входящие HTTP-запросы. В данном случае, мы оборачиваем наш mux в corsMiddleware, чтобы добавить поддержку CORS (Cross-Origin Resource Sharing).
	}

	// log.Fatal(http.ListenAndServe(srv.Addr, srv.Handler))

	go func() {
		log.Printf("API server started: http://localhost:%s", cfg.Port)
		log.Printf("Listen addr=%q", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)                      // Создаем канал для получения сигналов операционной системы, который будет использоваться для graceful shutdown (корректного завершения работы сервера).
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM) // Регистрируем канал для получения сигналов SIGINT (обычно отправляемый при нажатии Ctrl+C) и SIGTERM (обычно отправляемый при завершении процесса).

	<-stop

	log.Println("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), cfg.HTTP.ShutdownTimeout) // Создаем контекст с таймаутом для корректного завершения работы сервера.
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil { // Пытаемся корректно завершить работу сервера, передавая ему контекст с таймаутом. Если сервер не успеет завершиться в течение указанного времени, он будет принудительно остановлен.
		log.Printf("shutdown error: %v", err)
		_ = srv.Close() // Если произошла ошибка при попытке корректного завершения, принудительно закрываем сервер.
	}

	if c, ok := any(repo).(interface{ Close() error }); ok { // Проверяем, реализует ли репозиторий интерфейс с методом Close() для корректного закрытия соединения с базой данных.
		_ = c.Close() // Если репозиторий реализует интерфейс с методом Close(), вызываем его для закрытия соединения с базой данных.
	}

	log.Println("bye")
}
