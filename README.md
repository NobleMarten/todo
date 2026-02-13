# TODO (Go)

REST API для управления задачами (CRUD) с фильтрацией, сортировкой, пагинацией, поддержкой PATCH, централизованной обработкой ошибок и unit/HTTP тестами

### Имеется cli и http API

## Архитектура проекта

cmd/
  todo-api/
  todo-cli/
data/
internal/
  model/
  service/
  storage/
  transport/

  service - бизнес-логика
  storage - хранилище (Json, FakeStorage)
  transport - http хендлеры
  model - модель ToDo

    Поля:
  	•	id (int)
  	•	title (string)
  	•	done (bool)
  	•	created_at (time)
  	•	done_at (time|null)

## Features
  • CRUD operations
  • PATCH 
  • Фильтрация по date/done
  • Сортировка по id/date/create_date
  • Пагинация
  • Валидация title
  • Централизованная обработка ошибок JSON
  • Unit тесты для service
  • HTTP тесты для handlers
  

## Получить список задач
  GET /todos

  Response: 200 OK
  Body: JSON-массив задач

  ### Формат ответа API
  ```json
  {
  "items": [...],
  "total": 5,
  "limit": 10,
  "offset": 0
  }
  ```

## Получить задачу по ID
  GET /todos/{id}

  Response:
	•	200 OK + задача
	•	400 Bad Request (id не число или <= 0)
	•	404 Not Found (нет такой задачи)

## Фильтр по дате и done
  GET todos?from=2026-01-18&to=2026-01-22&done=false

  Response:
  •	200 OK + JSON-массив задач, соответствующих фильтрам
  •	400 Bad Request (неверный формат даты)
  •	404 Not Found (нет задач, соответствующих фильтрам)

## Пагинация
  GET /todos?page={page}&limit={limit}

  Response:
  •	200 OK + JSON-массив задач (с учетом пагинации)
  •	400 Bad Request (неверные параметры)
  •	404 Not Found (нет задач на указанной странице)

## Создать задачу
  POST /todos

  Body (JSON):
  ```json
	{
	"title": "разобрать документы"
	}
  ```
  Response: 201 Created + созданная задача

## Изменить title, done/undone
  # Отметить выполненным
    PUT /todos/id/done(undone)

  PATCH /todos/17

  ```json
  {
    "title": "test upd",
    "done": true
  }
  ```
  Пример: /todos/done?id=2&done=true
  
  Response:
  	•	204 No Content (успех)
  	•	400 Bad Request
  	•	404 Not Found
    
## Удалить задачу
  DELETE /todos?id={id}
  
  Пример: /todos?id=2
  
  Response:
  	•	204 No Content (успех)
  	•	400 Bad Request
  	•	404 Not Found

## Формат ошибок

```
{
  "code": "EMPTY_TITLE",
  "message": "empty title"
}
```

## Запуск:

# CLI
```
go run ./cmd/todo-cli -- help
go run ./cmd/todo-cli -- list
go run ./cmd/todo-cli -- add "купить молоко"
```

# API
```
go run ./cmd/todo-api
```
  
## Roadmap

- CLI
- REST API
- Filtering
- Pagination
- Sorting
- PATCH
- JSON error handing
- Unit tests
- HTTP tests
- Postgresql storage
- Middleware (logging)
- Docker support

