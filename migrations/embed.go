// Package migrations встраивает SQL-миграции goose в бинарник,
// чтобы на VPS не требовался отдельный инструмент для их прогона.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
