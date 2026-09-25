/**
 * Экраны, где таб-бара нет: внутри списка снизу живёт поле быстрого ввода (макет B2),
 * на «Собрать день» — кнопка «начать день» (макет A2).
 */
export function hidesTabBar(pathname: string): boolean {
  if (pathname === '/plan') return true
  return /^\/lists\/[^/]+$/.test(pathname)
}
