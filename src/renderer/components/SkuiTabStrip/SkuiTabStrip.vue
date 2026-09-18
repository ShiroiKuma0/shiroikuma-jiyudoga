<template>
  <div
    v-if="visible"
    class="skuiTabStrip"
    role="tablist"
  >
    <div class="tabs">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeId }"
        role="tab"
        tabindex="0"
        :aria-selected="tab.id === activeId"
        :title="labelFor(tab)"
        @click="activateTab(tab.id)"
        @keydown.enter="activateTab(tab.id)"
        @keydown.space.prevent="activateTab(tab.id)"
        @auxclick.middle.prevent="closeTab(tab.id)"
      >
        <span class="label">{{ labelFor(tab) }}</span>
        <button
          class="close"
          :title="t('SKUI.Tabs.Close tab')"
          @click.stop="closeTab(tab.id)"
        >
          <FontAwesomeIcon :icon="['fas', 'times']" />
        </button>
      </div>
    </div>
    <button
      class="newTab"
      :title="t('SKUI.Tabs.New tab')"
      @click="openLandingTab"
    >
      <FontAwesomeIcon :icon="['fas', 'plus']" />
    </button>
  </div>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import store from '../../store/index'
import { activateTab, closeTab, openLandingTab, tabsState } from '../../helpers/skuiTabs'

const { t } = useI18n()

const tabs = computed(() => tabsState.tabs)
const activeId = computed(() => tabsState.activeId)

/** @type {import('vue').ComputedRef<boolean>} */
const alwaysShow = computed(() => store.getters.getSkuiTabsAlwaysShow)

// With one tab the app looks exactly as it always did; opening a second reveals the strip.
const visible = computed(() => tabsState.ready && (tabsState.tabs.length > 1 || alwaysShow.value))

/**
 * @param {import('../../helpers/skuiTabs').SkuiTab} tab
 */
function labelFor(tab) {
  return tab.title.length > 0 ? tab.title : tab.path
}
</script>

<style scoped src="./SkuiTabStrip.css" />
