<!--
  One action row of a menu (black-yellow-theme, "Menus"): an outlined pill as wide as the menu,
  1.25 px, its icon inside at the left in the colour of what the row does, the label after it,
  and a › at the right end when the row opens something. A deleting row lends the delete red to
  frame, icon and label. Used by every action menu the app draws itself: the FtIconButton
  dropdowns (tile ⋯ menus) and the right-click / long-press menu on in-app links.
-->
<template>
  <span
    class="skuiMenuPill"
    :class="{ skuiMenuPillDanger: item.destructive }"
  >
    <FontAwesomeIcon
      :icon="['fas', item.icon]"
      class="skuiMenuIcon"
      :class="item.destructive ? 'skuiRole-delete' : `skuiRole-${item.role}`"
    />
    <span class="skuiMenuLabel">{{ label }}</span>
    <span
      v-if="item.opens"
      class="skuiMenuOpens"
      aria-hidden="true"
    />
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

import { skuiMenuItem } from '../helpers/skuiMenu'

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  /** the option's `value` / the entry's `action`: the key of its row in SKUI_MENU_ITEMS */
  itemKey: {
    type: String,
    default: ''
  }
})

const item = computed(() => skuiMenuItem(props.itemKey))
</script>
