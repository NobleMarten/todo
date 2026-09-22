# syntax=docker/dockerfile:1

# ─── stage 1: сборка бандла ───────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Сначала только манифесты — слой с npm ci переиспользуется,
# пока не поменялся package-lock.json.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# ВАЖНО: Vite подставляет import.meta.env.VITE_* на этапе СБОРКИ,
# в рантайме этот адрес поменять уже нельзя — он вшит в JS-бандл.
# Пустое значение (по умолчанию) → api.ts падает на `?? ''` и шлёт
# относительные запросы /todos, которые nginx проксирует на backend.
# Это убирает CORS как класс: браузер видит один origin.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ─── stage 2: раздача статики ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
