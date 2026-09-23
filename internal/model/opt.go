package model

import "encoding/json"

// Opt — поле PATCH-запроса с тремя состояниями:
//   - ключа нет в JSON → Set = false (не трогаем);
//   - пришёл null      → Set = true, Value = nil (очищаем);
//   - пришло значение  → Set = true, Value = &v.
//
// encoding/json не вызывает UnmarshalJSON для отсутствующих ключей,
// поэтому Set остаётся false сам собой.
type Opt[T any] struct {
	Set   bool // ключ присутствовал в JSON
	Value *T   // nil, если пришёл null
}

func (o *Opt[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	o.Value = &v
	return nil
}
