import { computed, inject, provide } from 'vue'
import store from '../store/index'

/**
 * The 白い熊 UI settings page as a folding accordion with a draggable index
 * (black-yellow-theme, "Long settings pages", 2026-11-19): every section folds, folded by
 * default; a chip per section on top jumps to it, and dragging a chip reorders the sections.
 * Order and fold state are two settings (`skuiUiSectionOrder`, `skuiUiSectionsOpen`) — JSON
 * arrays of section keys, transferable, so a restore brings the arrangement back.
 */

const LAYOUT_KEY = Symbol('skuiPageLayout')

/** @param {string} json */
function parseKeys(json) {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter(key => typeof key === 'string') : []
  } catch {
    return []
  }
}

/**
 * Called once by the page.
 * @param {import('vue').ComputedRef<{ key: string, title: string, icon: string, color: string }[]>} sections
 *   in their default order, only the ones this platform shows. `icon` and `color` are the
 *   section's icon and which of the seven section colours it is drawn in — kept here, next to
 *   the title, so the heading and the chip of a section cannot drift apart.
 */
export function provideSkuiPageLayout(sections) {
  const storedOrder = computed(() => parseKeys(store.getters.getSkuiUiSectionOrder))
  const openKeys = computed(() => new Set(parseKeys(store.getters.getSkuiUiSectionsOpen)))

  /** The sections in their current order: the stored keys that still exist, then any new ones. */
  const ordered = computed(() => {
    const byKey = new Map(sections.value.map(section => [section.key, section]))
    const result = []

    for (const key of storedOrder.value) {
      if (byKey.has(key)) {
        result.push(byKey.get(key))
        byKey.delete(key)
      }
    }

    return result.concat([...byKey.values()])
  })

  const positions = computed(() => new Map(ordered.value.map((section, index) => [section.key, index])))

  const byKey = computed(() => new Map(sections.value.map(section => [section.key, section])))

  const layout = {
    ordered,

    /** @param {string} key the section's registry entry: title, icon, colour */
    meta: key => byKey.value.get(key),

    /** @param {string} key */
    orderOf: key => (positions.value.get(key) ?? 0) + 1,

    /** @param {string} key */
    isFirst: key => ordered.value[0]?.key === key,

    /** @param {string} key */
    isOpen: key => openKeys.value.has(key),

    /** @param {string} key */
    toggle(key) {
      const next = new Set(openKeys.value)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      store.dispatch('updateSkuiUiSectionsOpen', JSON.stringify([...next]))
    },

    /** @param {string} key */
    open(key) {
      if (openKeys.value.has(key)) return

      store.dispatch('updateSkuiUiSectionsOpen', JSON.stringify([...openKeys.value, key]))
    },

    /** @param {string[]} keys the full new order */
    setOrder(keys) {
      store.dispatch('updateSkuiUiSectionOrder', JSON.stringify(keys))
    },

    resetOrder() {
      store.dispatch('updateSkuiUiSectionOrder', '[]')
    },
  }

  provide(LAYOUT_KEY, layout)

  return layout
}

/** For the section wrappers, wherever they sit below the page. */
export function useSkuiPageLayout() {
  return inject(LAYOUT_KEY)
}
