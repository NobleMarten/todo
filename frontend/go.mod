// Отдельный модуль только затем, чтобы `go build/vet/test ./...` из корня не заходил в frontend/node_modules
// (npm-пакеты вроде flatted кладут туда Go-код). Go-кода во frontend/ нет.
module todo/frontend

go 1.26.0
