import { openTask } from '../lib/opener'

/**
 * Открыть карточку задачи поверх текущего экрана (lib/opener). Функция одна на всё приложение
 * и не подписывает компонент на адрес: строки списка не перерисовываются при открытии шита.
 */
export function useOpenTask(): typeof openTask {
  return openTask
}
