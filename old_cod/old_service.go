package oldcod

// done
// Tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for i, t := range Tasks {
// 	if t.ID == id {

// 		if t.Done {
// 			return model.Task{}, model.ErrAlreadyDone
// 		}
// 		now := time.Now()
// 		Tasks[i].DoneAt = &now
// 		Tasks[i].Done = true
// 		err = s.store.Save(Tasks)
// 		if err != nil {
// 			return model.Task{}, err
// 		}
// 		return Tasks[i], nil
// 	}
// }
// return model.Task{}, model.ErrNotFound

// undone
// Tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for i, t := range Tasks {
// 	if t.ID == id {
// 		if !t.Done {
// 			return model.Task{}, model.ErrNotDone
// 		}
// 		Tasks[i].Done = false
// 		Tasks[i].DoneAt = nil
// 		err = s.store.Save(Tasks)
// 		if err != nil {
// 			return model.Task{}, err
// 		}
// 		return Tasks[i], nil
// 	}
// }

// return model.Task{}, model.ErrNotFound

//delete
// Tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }

// for i, t := range Tasks {
// 	if t.ID == id {
// 		// 4) удалить из среза (append(model.Tasks[:i], model.Tasks[i+1:]...))
// 		deletedTask := Tasks[i]
// 		Tasks = append(Tasks[:i], Tasks[i+1:]...) //... значит “вставь элементы второго среза поэлементно”, а не как один вложенный срез.
// 		err = s.store.Save(Tasks)
// 		if err != nil {
// 			return model.Task{}, err
// 		}
// 		return deletedTask, nil
// 	}
// }

//getbyid
// tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for _, t := range tasks {
// 	if t.ID == id {
// 		return t, nil
// 	}
// }
// return model.Task{}, model.ErrNotFound

//update
// tasks, err := s.store.Load()
// if err != nil {
// 	return model.Task{}, err
// }
// for i, t := range tasks {
// 	if t.ID == id {
// 		tasks[i] = task
// 		break
// 	}
// }
