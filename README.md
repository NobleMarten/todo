### TODO (Go)

Небольшой учебный проект на Go: TODO с хранением данных в json файле 
(в дальнейшем в postgresql)

Есть cli и http API

Запуск:

#CLI
```
go run ./cmd/todo-cli -- help
go run ./cmd/todo-cli -- list
go run ./cmd/todo-cli -- add "купить молоко"
```

#API
```
go run ./cmd/todo-api
```

Server: http;//localhost:8080

##Получить список задач
  GET /todos

  Response: 200 OK
  Body: JSON-массив задач

##Получить задачу по ID
  GET /todos/{id}

  Response:
	•	200 OK + задача
	•	400 Bad Request (id не число или <= 0)
	•	404 Not Found (нет такой задачи)

##Создать задачу
  POST /todos

  Body (JSON):
  ```
  {"title": "разобрать документы"}
  ```
  Response: 201 Created + созданная задача

##Изменить done/undone
  PUT /todos/done?id={id}&done={true|false}

  Пример: /todos/done?id=2&done=true
  
  Response:
  	•	204 No Content (успех)
  	•	400 Bad Request
  	•	404 Not Found
    
##Удалить задачу
  DELETE /todos?id={id}
  
  Пример: /todos?id=2
  
  Response:
  	•	204 No Content (успех)
  	•	400 Bad Request
  	•	404 Not Found

##Модель Todo
  
  Поля (пример):
  	•	id (int)
  	•	title (string)
  	•	done (bool)
  	•	created_at (time)
  	•	done_at (time|null)


  

