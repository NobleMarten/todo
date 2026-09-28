// После быстрого добавления: докрутить до новой строки и коротко её подсветить,
// иначе в длинном списке задача уходит в свой блок ниже экрана и её не видно.
// Строку ищем по data-task-id (AnimatedRow); она появляется на экране через кадр-другой после ответа сервера.

const FLASH_MS = 1200
const MAX_FRAMES = 20

export function revealTask(id: number): void {
  let frames = 0
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)
    if (!el) {
      if (++frames < MAX_FRAMES) requestAnimationFrame(tick)
      return
    }
    // scroll-margin у строк (index.css) оставляет место под пристыкованным полем ввода
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    el.classList.remove('just-added')
    void el.offsetWidth // перезапуск анимации, если добавили две подряд
    el.classList.add('just-added')
    setTimeout(() => el.classList.remove('just-added'), FLASH_MS)
  }
  requestAnimationFrame(tick)
}
