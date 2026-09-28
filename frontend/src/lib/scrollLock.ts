// Страница под шитом не прокручивается. overflow: hidden на body iOS Safari не останавливает:
// фон всё равно едет и тянется резинкой. Надёжно — зафиксировать body (position: fixed) со сдвигом
// на текущую прокрутку, а при снятии вернуть прокрутку на место.

let locks = 0
let savedY = 0

export function lockScroll(): void {
  if (locks++ > 0) return
  savedY = window.scrollY
  const s = document.body.style
  s.position = 'fixed'
  s.top = `-${savedY}px`
  s.left = '0'
  s.right = '0'
  s.overflow = 'hidden'
}

export function unlockScroll(): void {
  if (locks === 0 || --locks > 0) return
  const s = document.body.style
  s.position = ''
  s.top = ''
  s.left = ''
  s.right = ''
  s.overflow = ''
  window.scrollTo(0, savedY)
}

/** Пока шит открыт, window.scrollY = 0 — это не прокрутка экрана, запоминать её нельзя. */
export function isScrollLocked(): boolean {
  return locks > 0
}
