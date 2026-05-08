package config

import (
	"os"
	"time"
	"todo/internal/model"

	"github.com/joho/godotenv"
)

type Config struct {
	Env  string
	Port string
	DB   struct{ URL string }
	HTTP struct{ ShutdownTimeout time.Duration }
}

func Load() (Config, error) {
	// пытаемся загрузить .env, игнорируем ошибку, если файла нет (например, в проде)
	if err := godotenv.Load(".envlocal"); err != nil {
		_ = godotenv.Load(".env")
	}

	var cfg Config

	cfg.Env = getEnv("ENV", "local")  // берем значение из переменной окружения ENV, если не задано - используем local
	cfg.Port = getEnv("PORT", "8080") // берем значение из переменной окружения PORT, если не задано - используем 8080

	cfg.DB.URL = os.Getenv("DB_URL") // берем значение из переменной окружения DB_URL, если не задано - оставляем пустым

	if cfg.DB.URL == "" {
		return Config{}, model.ErrMissingDBURL
	}

	cfg.HTTP.ShutdownTimeout = getDurationEnv("HTTP_SHUTDOWN_TIMEOUT", 10*time.Second) // берем значение из переменной окружения HTTP_SHUTDOWN_TIMEOUT, если не задано - используем 10 секунд
	if cfg.HTTP.ShutdownTimeout <= 0 {
		return Config{}, model.ErrInvalidShutdownTimeout
	}
	return cfg, nil
}

func getEnv(key, def string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return def
}

func getDurationEnv(key string, def time.Duration) time.Duration { // функция для получения значения из переменной окружения и преобразования его в time.Duration
	v := os.Getenv(key) // берем значение из переменной окружения
	if v == "" {
		return def // если значение не задано, возвращаем дефолтное значение
	}
	d, err := time.ParseDuration(v) // пытаемся преобразовать строку в time.Duration (например, "10s", "1m", "500ms" и т.д.)
	if err != nil {
		return def // если произошла ошибка при преобразовании, возвращаем дефолтное значение
	}
	return d
}
