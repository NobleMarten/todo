/**
 * Экраны, где таб-бара нет: внутри списка снизу живёт поле быстрого ввода (макет B2),
 * на «Собрать день» — кнопка «начать день» (макет A2).
 */
export function hidesTabBar(pathname: string): boolean {
  if (pathname === '/plan') return true
  return /^\/lists\/[^/]+$/.test(pathname)
}

/**
 * Куда ведёт «назад» с экрана (как стрелка в его шапке): список → «Списки», поиск → «Списки»,
 * «Собрать день» → «Сегодня». null — корень вкладки, «назад» там нет (свайп от края не работает).
 */
export function parentOf(pathname: string): string | null {
  if (pathname === '/plan') return '/today'
  if (pathname === '/search' || /^\/lists\/[^/]+$/.test(pathname)) return '/lists'
  return null
}
