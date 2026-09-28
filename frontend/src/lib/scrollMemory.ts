// Где был экран прокручен — как в нативных табах: каждая вкладка помнит свою прокрутку,
// «назад» возвращает туда, где был, переход вперёд на новый экран начинается сверху.
// Здесь только решение «куда прокрутить»; снимает и ставит прокрутку hooks/useScrollRestoration.

export type NavType = 'POP' | 'PUSH' | 'REPLACE'

/** Корни вкладок таб-бара: переход на них из таб-бара возвращает прокрутку вкладки. */
export const TAB_ROOTS = ['/today', '/week', '/lists', '/archive']

export function createScrollMemory(tabRoots: string[] = TAB_ROOTS) {
  const byKey = new Map<string, number>() // запись истории (location.key) → прокрутка
  const byTab = new Map<string, number>() // корень вкладки → прокрутка

  return {
    /** Экран с этим ключом истории и путём прокручен на y. */
    save(key: string, pathname: string, y: number): void {
      byKey.set(key, y)
      if (tabRoots.includes(pathname)) byTab.set(pathname, y)
    },

    /**
     * Куда прокрутить после перехода: число — прокрутить, null — не трогать.
     * «Назад/вперёд» — туда, где был этот экран; на вкладку — туда, где была вкладка;
     * вперёд на другой экран — наверх; replace (смена недели, редирект) — не трогать.
     */
    target(type: NavType, key: string, pathname: string): number | null {
      if (type === 'POP') return byKey.get(key) ?? 0
      if (type === 'REPLACE') return null
      if (tabRoots.includes(pathname)) return byTab.get(pathname) ?? 0
      return 0
    },
  }
}
