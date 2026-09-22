# syntax=docker/dockerfile:1

# ─── stage 1: сборка ──────────────────────────────────────────────────────────
# Отдельная стадия со всем Go-тулчейном (~800 МБ). В финальный образ
# из неё переедет только скомпилированный бинарник.
FROM golang:1.26-alpine AS build

WORKDIR /src

# go.mod/go.sum копируем ОТДЕЛЬНО и раньше исходников: слой с зависимостями
# переиспользуется, пока не менялись сами зависимости. Правка кода в internal/
# не заставляет качать модули заново.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY cmd ./cmd
COPY internal ./internal

# CGO_ENABLED=0 → статический бинарник без зависимостей от libc,
# его можно положить в почти пустой образ.
# -trimpath убирает пути сборочной машины, -s -w выкидывает отладочные секции.
# Кэш-маунты не попадают в слои образа, но переживают пересборки.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/todo-api ./cmd/todo-api

# ─── stage 2: рантайм ─────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime

# ca-certificates — на будущее (TLS к БД/внешним сервисам),
# tzdata — чтобы time.Local в контейнере не был пустым UTC-заглушкой.
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app

COPY --from=build /out/todo-api /usr/local/bin/todo-api

# не root: если кто-то пролезет через приложение, он окажется без привилегий
USER app

EXPOSE 8080

# exec-форма (без /bin/sh): процесс становится PID 1 и получает SIGTERM
# напрямую — graceful shutdown в main.go отрабатывает как задумано.
ENTRYPOINT ["/usr/local/bin/todo-api"]
